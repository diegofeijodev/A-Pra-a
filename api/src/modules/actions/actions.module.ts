import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { TemplateActionsController } from './template-actions.controller';

@Module({
  controllers: [ActionsController, TemplateActionsController],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
