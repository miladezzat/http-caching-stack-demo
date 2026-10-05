import { BadRequestException, Body, Controller, Get, Param, Patch, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { ScenariosService } from '../admin/scenarios.service';
import { CacheResponder } from '../http-cache/cache-responder.service';
import { ProductsService } from './products.service';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService, private readonly cache: CacheResponder, private readonly scenarios: ScenariosService) {}
  @Get()
  async findAll(@Req() req: Request, @Res() res: Response) {
    this.assertRead(req);
    await this.products.read(undefined, (current, tags, load) => this.cache.reply(req, res, current, tags, false, load));
  }
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    this.assertRead(req);
    await this.products.read(id, (current, tags, load) => this.cache.reply(req, res, current, tags, true, load));
  }
  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() patch: UpdateProductDto, @Req() req: Request) {
    return this.products.update(id, patch, req.headers);
  }
  private assertRead(req: Request) {
    this.scenarios.assertOrigin();
    if (Object.keys(req.query).length) throw new BadRequestException('This representation does not accept query parameters');
  }
}
