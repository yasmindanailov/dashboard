import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProvisioningService } from './provisioning.service';

@ApiTags('Provisioning')
@Controller('provisioning')
export class ProvisioningController {
  constructor(private readonly Service: ProvisioningService) {}
}

