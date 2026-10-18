import { Global, Module } from '@nestjs/common';
import { Database } from './database';
import { LocalAdminGuard, VisitorGuard } from './http';

@Global()
@Module({
  providers: [Database, VisitorGuard, LocalAdminGuard],
  exports: [Database, VisitorGuard, LocalAdminGuard],
})
export class CoreModule {}
