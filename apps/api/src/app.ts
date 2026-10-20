import {
  SupportPortalService,
  SupportPortalController,
  ClientDomainService,
  ClientDomainController,
} from './support-portal';
import { ProblemController, ProblemService } from './problems';
import 'reflect-metadata';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { AdministrationReadOnlyGuard } from './administration-read-only';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { readConfig } from './config';
import { Dependencies, DependencyProbe } from './dependencies';
import { HealthController } from './health';
import { AuthController, AuthService } from './auth';
import { CoreController, CoreService } from './core';
import { AdminController, AdminService } from './admin';
import { GroupController, GroupService } from './groups';
import { EntraDirectoryService } from './entra-directory';
import { TicketController, TicketService } from './tickets';
import { SlaReportController, SlaReportService } from './sla-reports';
import { NotificationController, NotificationService } from './notifications';
import { ChangeController, ChangeService } from './changes';
import { InternalController, InternalService } from './internal';
import {
  ChangeGovernanceController,
  ChangeGovernanceService,
} from './change-governance';
import { MailSettingsController, MailSettingsService } from './mail-settings';
import { MailRecordController, MailRecordService } from './mail-records';
import { ClientPortalController, ClientPortalService } from './client-portal';
import { KnowledgeController, KnowledgeService } from './knowledge';
import { HelpController, HelpService } from './help';
import { HelpSearchService } from './help-search';
import { WebGuidanceService } from './web-guidance';
import {
  ServiceReportController,
  ServiceReportService,
} from './service-reports';
@Catch()
class Errors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (exception as { code?: string })?.code === '23505'
          ? 409
          : ['23503', '23514'].includes(
                (exception as { code?: string })?.code ?? '',
              )
            ? 400
            : 500;
    const response = host.switchToHttp().getResponse();
    const requestId = randomUUID();
    const failure = exception as {
      code?: unknown;
      constraint?: unknown;
      message?: unknown;
      name?: unknown;
      table?: unknown;
    };
    console.error(
      JSON.stringify({
        event: 'http.error',
        status,
        requestId,
        errorName: typeof failure?.name === 'string' ? failure.name : undefined,
        errorCode: typeof failure?.code === 'string' ? failure.code : undefined,
        // Do not log arbitrary exception messages: upstream errors can contain credentials.
        table: typeof failure?.table === 'string' ? failure.table : undefined,
        constraint:
          typeof failure?.constraint === 'string'
            ? failure.constraint
            : undefined,
      }),
    );
    const request = host.switchToHttp().getRequest<{ url: string }>();
    if (request.url.split('?')[0] === '/auth/callback') {
      const reason =
        status === 403 ? 'access' : status >= 500 ? 'unavailable' : 'expired';
      response.code(303).redirect(`/?signin=${reason}&reference=${requestId}`);
      return;
    }
    response.status(status).send({
      error: {
        code: `HTTP_${status}`,
        message:
          status === 409
            ? exception instanceof HttpException
              ? exception.message
              : 'This record already exists.'
            : status === 400
              ? exception instanceof HttpException &&
                !Array.isArray(
                  (exception.getResponse() as { message?: unknown }).message,
                )
                ? exception.message
                : 'Check the required fields, formats and linked records.'
              : status === 404
                ? 'Not found'
                : status >= 500
                  ? 'Service unavailable'
                  : 'Request rejected',
        requestId,
      },
    });
  }
}
@Module({
  controllers: [
    HealthController,
    AuthController,
    CoreController,
    AdminController,
    GroupController,
    TicketController,
    SlaReportController,
    NotificationController,
    ChangeController,
    ProblemController,
    InternalController,
    ChangeGovernanceController,
    MailSettingsController,
    MailRecordController,
    ClientPortalController,
    SupportPortalController,
    ClientDomainController,
    KnowledgeController,
    HelpController,
    ServiceReportController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AdministrationReadOnlyGuard },
    Dependencies,
    AuthService,
    EntraDirectoryService,
    CoreService,
    AdminService,
    GroupService,
    TicketService,
    SlaReportService,
    NotificationService,
    ChangeService,
    ProblemService,
    InternalService,
    ChangeGovernanceService,
    MailSettingsService,
    MailRecordService,
    ClientPortalService,
    SupportPortalService,
    ClientDomainService,
    KnowledgeService,
    HelpService,
    HelpSearchService,
    WebGuidanceService,
    ServiceReportService,
  ],
})
class AppModule {}
export async function createApp(probe?: DependencyProbe) {
  const config = readConfig();
  const rootModule = probe
    ? {
        module: class TestModule {},
        controllers: [HealthController],
        providers: [{ provide: Dependencies, useValue: probe }],
      }
    : AppModule;
  const app = await NestFactory.create<NestFastifyApplication>(
    rootModule,
    new FastifyAdapter({ bodyLimit: 32 * 1024 * 1024 }),
    { logger: false },
  );
  await app.register(helmet);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  if (config.ENABLE_API_DOCS === 'true') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Amnikon Service Desk API')
        .setVersion('0.2.0')
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { ui: false });
  }
  return app;
}
