import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthUser } from '../../common/auth/auth-user';
import { AdminOnly, GestorOuAdmin } from '../../common/decorators/admin-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddPlaceLeadsDto, PlaceSearchQueryDto, PutSegmentsDto, StartPlaceSearchDto } from './dto/places.dto';
import { PlacesSearchService } from './places-search.service';
import { PlacesSegmentsService } from './places-segments.service';

/**
 * Pesquisa automática de estabelecimentos (§22). Fechada ao consultor de campo (sem `@CampoRoute()`). A classe continua
 * `@AdminOnly()` (rota nova nasce só de admin); o lote E (§42.3) abre os métodos marcados ao gestor, **só com `source = osm`**
 * (conferido no serviço: Apify, que é pago, segue só de admin). Os segmentos (configuração) continuam só de admin.
 */
@ApiTags('Pesquisa de estabelecimentos')
@ApiBearerAuth()
@AdminOnly()
@Controller('v1/place-searches')
export class PlacesController {
  constructor(
    private readonly searches: PlacesSearchService,
    private readonly segments: PlacesSegmentsService,
  ) {}

  @GestorOuAdmin()
  @Post()
  async start(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartPlaceSearchDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { run, nova } = await this.searches.start(dto, user);
    // 202 = busca nova na fila; 200 = reaproveitou uma busca recente (cache) ou em andamento.
    void res.code(nova ? 202 : 200);
    return run;
  }

  // Estáticas antes de ':id' (a ordem importa).
  @GestorOuAdmin()
  @Get('sources')
  sources() {
    return this.searches.sources();
  }

  /** Segmentos editáveis (§36.6): `404 SEGMENTS_DISABLED` com a flag desligada. */
  @GestorOuAdmin()
  @Get('segments')
  segmentos() {
    return this.segments.view();
  }

  @AdminOnly()
  @Put('segments')
  salvarSegmentos(@CurrentUser() user: AuthUser, @Body() dto: PutSegmentsDto) {
    return this.segments.salvar(dto.segments, user);
  }

  @GestorOuAdmin()
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: PlaceSearchQueryDto) {
    return this.searches.list(q.praca_id, user);
  }

  @GestorOuAdmin()
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: PlaceSearchQueryDto) {
    return this.searches.get(id, q.praca_id, user);
  }

  @GestorOuAdmin()
  @Get(':id/candidates')
  candidates(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: PlaceSearchQueryDto) {
    return this.searches.candidates(id, q.praca_id, user);
  }

  @GestorOuAdmin()
  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() q: PlaceSearchQueryDto) {
    return this.searches.cancel(id, q.praca_id, user);
  }

  @GestorOuAdmin()
  @Post(':id/leads')
  addLeads(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: AddPlaceLeadsDto) {
    return this.searches.addLeads(id, dto, user);
  }
}
