
import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  private products: Product[] = [
    new Product({ id: '1', name: 'Laptop', price: 1500, category: 'electronics', updatedAt: new Date().toISOString() }),
    new Product({ id: '2', name: 'Shoes', price: 120, category: 'apparel', updatedAt: new Date().toISOString() }),
    new Product({ id: '3', name: 'Phone', price: 899, category: 'electronics', updatedAt: new Date().toISOString() }),
  ];

  findAll(): { data: Product[]; updatedAt: string } {
    const latest = this.products.reduce((d, p) => Math.max(d, Date.parse(p.updatedAt)), 0);
    return { data: this.products, updatedAt: new Date(latest || Date.now()).toISOString() };
  }

  findOne(id: string): Product {
    const p = this.products.find(x => x.id === id);
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  update(id: string, patch: Partial<Product>) {
    const p = this.findOne(id);
    Object.assign(p, patch);
    p.updatedAt = new Date().toISOString();
    return p;
  }
}
