import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module';
import { AccountLeaseModule } from '../server/modules/account-lease/account-lease.module';
import { UpstreamsModule } from '../upstreams/upstreams.module';
import { UpstreamDispatcherService } from './upstream-dispatcher.service';

@Module({
  imports: [RoutingModule, AccountLeaseModule, UpstreamsModule],
  providers: [UpstreamDispatcherService],
  exports: [UpstreamDispatcherService],
})
export class DispatcherModule {}
