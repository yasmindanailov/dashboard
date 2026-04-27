import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';

@Module({
  imports: [AuthModule],
  controllers: [ErrorLogController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
