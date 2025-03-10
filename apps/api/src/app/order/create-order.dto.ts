import { DataSource, Type } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  accountId: string;

  @IsString()
  currency: string;

  @IsEnum(DataSource, { each: true })
  @IsOptional()
  dataSource: DataSource;

  @IsISO8601()
  date: string;

  @IsNumber()
  fee: number;

  @IsNumber()
  quantity: number;

  @IsString()
  symbol: string;

  @IsEnum(Type, { each: true })
  type: Type;

  @IsNumber()
  unitPrice: number;
}
