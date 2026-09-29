import { Module } from '@nestjs/common';
import { RuleBasedRouterService } from './rule-based-router.service';

@Module({
  providers: [RuleBasedRouterService],
  exports: [RuleBasedRouterService],
})
export class RoutingModule {}
