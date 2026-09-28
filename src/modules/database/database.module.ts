import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createTypeOrmOptions } from "./database.config";

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => createTypeOrmOptions(),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
