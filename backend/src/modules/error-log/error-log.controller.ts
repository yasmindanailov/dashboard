import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ErrorLogService } from './error-log.service';

@ApiTags('ErrorLog')
@Controller('error-log')
export class ErrorLogController {
  constructor(private readonly Service: ErrorLogService) {}
}
