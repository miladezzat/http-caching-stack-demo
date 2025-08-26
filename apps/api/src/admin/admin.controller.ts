
import { Body, Controller, Post } from '@nestjs/common';
import { CdnService } from '../cdn/cdn.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly cdn: CdnService) {}
  @Post('purge')
  async purgeByTags(@Body() body: { tags: string[] }) {
    await this.cdn.purgeByTags(body.tags);
    return { ok: true, purged: body.tags };
  }
}
