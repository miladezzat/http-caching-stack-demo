
import { IsInt, IsNumber, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
export class UpdateProductDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @ValidateIf((_, value) => value !== undefined) @IsString() @Length(1, 100) @Matches(/\S/) name?: string;
  @ValidateIf((_, value) => value !== undefined) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) price?: number;
  @ValidateIf((_, value) => value !== undefined) @IsString() @Length(1, 64) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) category?: string;
}
