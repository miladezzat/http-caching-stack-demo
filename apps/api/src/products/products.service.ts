import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { ConditionalHeaders, evaluateConditions, Validators } from '../http-cache/conditions';
import { validators } from '../http-cache/validators';
import { MetricsService } from '../observability/metrics.service';
import { UpdateProductDto } from './dto/update-product.dto';

type ProductRow = { id: string; name: string; price: string | number; category: string; version: number; updated_at: Date };
type StateRow = { version: number; updated_at: Date };
function product(row: ProductRow) {
  return { id: row.id, name: row.name, price: Number(row.price), category: row.category, version: row.version, updatedAt: new Date(row.updated_at).toISOString() };
}

@Injectable()
export class ProductsService {
  constructor(private readonly db: DatabaseService, private readonly metrics: MetricsService) {}

  async read(id: string | undefined, visitor: (current: Validators, tags: string[], load: () => Promise<unknown>) => Promise<void>) {
    // Validators and the body belong to one snapshot, even during concurrent writes.
    await this.db.transaction(async tx => {
      this.metrics.metadataReads++;
      if (id) {
        const row = (await tx.query<ProductRow>('SELECT id, category, version, updated_at FROM products WHERE id=$1', [id])).rows[0];
        if (!row) throw new NotFoundException('Product not found');
        await visitor(validators(`product:${id}`, row.version, new Date(row.updated_at)), [`product:${id}`, `category:${row.category}`], async () => {
          this.metrics.bodyReads++;
          return product((await tx.query<ProductRow>('SELECT * FROM products WHERE id=$1', [id])).rows[0]);
        });
      } else {
        const row = (await tx.query<StateRow>('SELECT version, updated_at FROM catalog_state WHERE id=1')).rows[0];
        await visitor(validators('products', row.version, new Date(row.updated_at)), ['products'], async () => {
          this.metrics.bodyReads++;
          const { rows } = await tx.query<ProductRow>('SELECT * FROM products ORDER BY id');
          return { data: rows.map(product), version: row.version, updatedAt: new Date(row.updated_at).toISOString() };
        });
      }
    }, true);
  }

  async update(id: string, patch: UpdateProductDto, headers: ConditionalHeaders) {
    if (patch.name === undefined && patch.price === undefined && patch.category === undefined) throw new BadRequestException('Provide at least one product field');
    const result = await this.db.transaction(async tx => {
      const existing = (await tx.query<ProductRow>('SELECT * FROM products WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!existing) throw new NotFoundException('Product not found');
      if (evaluateConditions('PATCH', headers, validators(`product:${id}`, existing.version, new Date(existing.updated_at))) === 'precondition-failed') {
        throw new HttpException('Precondition failed', 412);
      }
      if (patch.expectedVersion !== existing.version) throw new ConflictException('Product changed; reload before saving');
      const updated = (await tx.query<ProductRow>(`UPDATE products SET name=$2, price=$3, category=$4,
        version=version+1, updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
        [id, patch.name ?? existing.name, patch.price ?? existing.price, patch.category ?? existing.category])).rows[0];
      await tx.query('UPDATE catalog_state SET version=version+1, updated_at=clock_timestamp() WHERE id=1');
      const tags = [...new Set([`product:${id}`, 'products', `category:${existing.category}`, `category:${updated.category}`])];
      const jobId = randomUUID();
      await tx.query('INSERT INTO purge_jobs(id,tags) VALUES ($1,$2)', [jobId, tags]);
      return { ok: true, product: product(updated), invalidation: { jobId, status: 'pending', tags } };
    });
    this.metrics.writes++;
    return result;
  }
}
