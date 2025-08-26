
import { Injectable } from '@nestjs/common';
@Injectable()
export class CdnService {
  async purgeByTags(tags: string[]) {
    console.log('[CDN] Purge requested for tags:', tags);
    return true;
  }
}
