import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiTags('KnowledgeBase')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly Service: KnowledgeBaseService) {}
}
