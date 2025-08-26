
import { Controller, Get, Param, Patch, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { CachePolicy } from '../common/cache-policy.decorator';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @CachePolicy({
    sMaxAge: 60,
    maxAge: 0,
    staleWhileRevalidate: 30,
    staleIfError: 60,
    scope: 'public',
    vary: ['Accept-Encoding'],
    lastModifiedField: 'updatedAt',
    etag: 'weak',
    tags: ['products'],
  })
  findAll(@Res({ passthrough: true }) res: Response) {
    const result = this.products.findAll();
    const categories = Array.from(new Set(result.data.map(p => `category:${p.category}`)));
    const existing = String(res.getHeader('Cache-Tag') || '');
    const tags = Array.from(new Set([...existing.split(',').filter(Boolean), ...categories]));
    if (tags.length) {
      res.setHeader('Cache-Tag', tags.join(','));
      res.setHeader('Surrogate-Key', tags.join(' '));
    }
    return result;
  }

  @Get(':id')
  @CachePolicy({
    sMaxAge: 300,
    maxAge: 0,
    staleWhileRevalidate: 60,
    scope: 'public',
    vary: ['Accept-Encoding'],
    lastModifiedField: 'updatedAt',
    etag: 'weak',
    tags: ['products'],
  })
  findOne(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const product = this.products.findOne(id);
    const dynamicTags = [`product:${product.id}`, `category:${product.category}`];
    const existing = String(res.getHeader('Cache-Tag') || '');
    const tags = Array.from(new Set([...existing.split(',').filter(Boolean), ...dynamicTags]));
    res.setHeader('Cache-Tag', tags.join(','));
    res.setHeader('Surrogate-Key', tags.join(' '));
    return product;
  }

  @Patch(':id')
  @CachePolicy({
    maxAge: 0,
    scope: 'private',
    vary: ['Accept-Encoding', 'Authorization'],
    etag: 'weak',
  })
  update(@Param('id') id: string, @Body() patch: UpdateProductDto) {
    const updated = this.products.update(id, patch);
    return { ok: true, product: updated, tagsToPurge: [`product:${id}`, `products`, `category:${updated.category}`] };
  }
}
