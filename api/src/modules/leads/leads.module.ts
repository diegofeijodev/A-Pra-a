import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { QueueService } from './queue.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, QueueService],
  exports: [LeadsService],
})
export class LeadsModule {}
