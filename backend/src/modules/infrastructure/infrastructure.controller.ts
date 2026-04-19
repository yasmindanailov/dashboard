import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InfrastructureService } from './infrastructure.service';

@ApiTags('Infrastructure')
@Controller('infrastructure')
export class InfrastructureController {
  constructor(private readonly Service: InfrastructureService) {}
}

