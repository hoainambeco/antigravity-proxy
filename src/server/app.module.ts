import { Module } from "@nestjs/common";
import { ApiKeyModule } from "../modules/api-key/api-key.module";
import { DatabaseModule } from "../modules/database/database.module";
import { ProxyModule } from "../modules/proxy-gateway/server/proxy.module";
import { AccountManagementController } from "../modules/cloud-account/controllers/account-management.controller";
import { SystemStatusController } from "../modules/cloud-account/controllers/system-status.controller";
import { WebUiController } from "../modules/cloud-account/controllers/web-ui.controller";

@Module({
  imports: [DatabaseModule, ApiKeyModule, ProxyModule],
  controllers: [
    AccountManagementController,
    SystemStatusController,
    WebUiController,
  ],
  providers: [],
})
export class AppModule {}
