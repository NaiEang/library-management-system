import 'dotenv/config';
import { DataSource } from 'typeorm';
import { dbSsl } from './ssl';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  ssl: dbSsl(),
});