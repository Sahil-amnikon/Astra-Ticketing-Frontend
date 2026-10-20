import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AdminQuery, AdminService } from './admin';
import { AuthService, type AuthenticatedUser } from './auth';
import { ClientPortalService, PortalQuery } from './client-portal';
import { KnowledgeQuery, KnowledgeService } from './knowledge';
import { TicketListQuery, TicketService } from './tickets';
import { visibleHelpTopics } from './help-topics';
import { WebGuidanceDto, WebGuidanceService } from './web-guidance';
import { HelpSearchService } from './help-search';

export class HelpQuestionDto {
  @IsString() @MinLength(2) @MaxLength(200) question!: string;
}

const STAFF = ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'];
const STOP_WORDS = new Set([
  'how',
  'do',
  'i',
  'can',
  'you',
  'please',
  'find',
  'show',
  'me',
  'the',
  'a',
  'an',
  'my',
  'for',
  'about',
  'is',
  'are',
  'where',
  'what',
  'with',
  'to',
  'in',
  'of',
  'on',
  'help',
  'search',
  'look',
  'up',
  'ticket',
  'tickets',
  'issue',
  'issues',
  'problem',
  'problems',
  'troubleshoot',
  'technical',
  'related',
  'similar',
  'status',
  'guide',
  'steps',
  'all',
  'recent',
  'client',
  'clients',
  'user',
  'users',
  'contact',
  'contacts',
  'site',
  'sites',
  'asset',
  'assets',
  'category',
  'categories',
  'tag',
  'tags',
  'article',
  'articles',
]);

export function searchTerms(question: string): string {
  const ticketNumber = question.match(/\b[A-Z]{2,8}-\d{3,10}\b/i)?.[0];
  if (ticketNumber) return ticketNumber.toUpperCase();
  return question
    .replace(/[^\p{L}\p{N}.@_-]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 5)
    .join(' ')
    .slice(0, 160);
}

@Injectable()
export class HelpService {
  constructor(
    private readonly tickets: TicketService,
    private readonly portal: ClientPortalService,
    private readonly knowledge: KnowledgeService,
    private readonly admin: AdminService,
    private readonly search: HelpSearchService,
  ) {}

  topics(user: AuthenticatedUser) {
    this.requireUser(user);
    return visibleHelpTopics(user).map((topic) => ({
      id: topic.id,
      title: topic.title,
      summary: topic.summary,
      steps: topic.steps,
      href: topic.href,
    }));
  }

  private requireUser(user: AuthenticatedUser) {
    if (
      !user.roles.includes('USER') &&
      !user.roles.some((role) => STAFF.includes(role))
    )
      throw new ForbiddenException();
  }

  async ask(user: AuthenticatedUser, question: string) {
    this.requireUser(user);
    const result = await this.search.search(user, question);
    return {
      answer: result.results.length
        ? 'I found troubleshooting guidance and related records within your access.'
        : 'I could not find a strong local match. Try a shorter symptom, product name, or error message.',
      ...result,
      topics: result.results.filter((r) => r.sourceType === 'guide'),
      knowledge: result.results.filter((r) => r.sourceType === 'knowledge'),
      tickets: result.results.filter((r) => r.sourceType === 'ticket'),
    };
  }
}

@Controller('help')
export class HelpController {
  constructor(
    private readonly auth: AuthService,
    private readonly help: HelpService,
    private readonly web: WebGuidanceService,
    private readonly helpSearch: HelpSearchService,
  ) {}

  @Get('topics') async topics(@Req() request: FastifyRequest) {
    return this.help.topics(await this.auth.currentUser(request));
  }

  @Post('ask') async ask(
    @Req() request: FastifyRequest,
    @Body() body: HelpQuestionDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.help.ask(await this.auth.currentUser(request), body.question);
  }

  @Get('web-status') async webStatus(@Req() request: FastifyRequest) {
    return this.web.status(await this.auth.currentUser(request));
  }

  @Post('web-search') async webSearch(
    @Req() request: FastifyRequest,
    @Body() body: WebGuidanceDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.web.search(await this.auth.currentUser(request), body);
  }

  @Post('feedback') async feedback(
    @Req() request: FastifyRequest,
    @Body() body: { query?: string; resultId?: string; helpful: boolean },
  ) {
    await this.auth.verifyCsrf(request);
    return this.helpSearch.feedback(await this.auth.currentUser(request), body);
  }

  @Post('resolution-feedback') async resolutionFeedback(
    @Req() request: FastifyRequest,
    @Body() body: { query?: string; resultId?: string; resolved: boolean },
  ) {
    await this.auth.verifyCsrf(request);
    return this.helpSearch.resolutionFeedback(await this.auth.currentUser(request), body);
  }
}
