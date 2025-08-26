
export class Product {
  id: string;
  name: string;
  price: number;
  updatedAt: string;
  category: string;
  constructor(init: Partial<Product>) { Object.assign(this, init); }
}
