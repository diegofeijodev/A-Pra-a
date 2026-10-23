import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PracaQueryDto, ProofBodyDto } from './dto/midia.dto';
import { MidiaService } from './midia.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

// Provas (vídeo de dono, vídeo de freelancer, caso escrito) são da PRAÇA, não da
// campanha: a mesma prova entra em quantas campanhas quiser.
@ApiTags('Provas da praça')
@ApiBearerAuth()
@Controller('v1/proofs')
export class ProofsController {
  constructor(private readonly midia: MidiaService) {}

  @Get()
  list(@Query() query: PracaQueryDto) {
    return this.midia.listProofs(query.praca_id);
  }

  @Equipe()
  @Post()
  create(@Body() dto: ProofBodyDto) {
    return this.midia.createProof(dto);
  }
}
