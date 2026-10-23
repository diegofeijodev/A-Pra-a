import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreativeBodyDto,
  CreativeStatusDto,
  CreativesQueryDto,
  PublishDateDto,
  ReviewCreativeDto,
} from './dto/midia.dto';
import { MidiaService } from './midia.service';
import { Equipe } from '../../common/decorators/admin-only.decorator';

@ApiTags('Criativos')
@ApiBearerAuth()
@Controller('v1/creatives')
export class CreativesController {
  constructor(private readonly midia: MidiaService) {}

  @Get()
  list(@Query() query: CreativesQueryDto) {
    return this.midia.listCreatives(query.campanha_id);
  }

  @Equipe()
  @Post()
  create(@Body() dto: CreativeBodyDto) {
    return this.midia.createCreative(dto);
  }

  @Equipe()
  @Put(':id')
  replace(@Param('id') id: string, @Body() dto: CreativeBodyDto) {
    return this.midia.replaceCreative(id, dto);
  }

  @Equipe()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.midia.removeCreative(id);
  }

  @Equipe()
  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: CreativeStatusDto) {
    return this.midia.setCreativeStatus(id, dto);
  }

  @Equipe()
  @Post(':id/publish-date')
  setPublishDate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PublishDateDto) {
    return this.midia.setPublishDate(id, dto, user);
  }

  @Equipe()
  @Post(':id/review')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewCreativeDto) {
    return this.midia.reviewCreative(id, dto, user);
  }
}
