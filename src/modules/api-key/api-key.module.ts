import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ApiKeyController } from "./api-key.controller";
import { AuthController } from "./auth.controller";
import { ApiKeyService } from "./api-key.service";
import { ApiKey } from "./entities/api-key.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [ApiKeyController, AuthController],
  providers: [ApiKeyService],
  exports: [ApiKeyService, TypeOrmModule],
})
export class ApiKeyModule {}
