import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Dependencies, DependencyProbe } from './dependencies';
@ApiTags('Operations')
@Controller()
export class HealthController {
  constructor(
    @Inject(Dependencies) private readonly dependencies: DependencyProbe,
  ) {}
  @Get('health')
  @ApiOperation({ summary: 'Process liveness' })
  health() {
    return { status: 'ok' };
  }
  @Get('ready')
  @ApiOperation({ summary: 'Database schema and Redis readiness' })
  @ApiResponse({ status: 503, description: 'Required dependency unavailable' })
  async ready() {
    if (!(await this.dependencies.check()))
      throw new ServiceUnavailableException('Service unavailable');
    return { status: 'ready' };
  }
}
