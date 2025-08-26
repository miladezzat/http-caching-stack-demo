
import { IsNumber, IsOptional, IsString } from 'class-validator';
export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsString() category?: string;
}
