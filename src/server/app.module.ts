import { Module } from "@nestjs/common";
import { ApiKeyModule } from "../modules/api-key/api-key.module";
import { DatabaseModule } from "../modules/database/database.module";
import { ProxyModule } from "../modules/proxy-gateway/server/proxy.module";

@Module({
  imports: [DatabaseModule, ApiKeyModule, ProxyModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
