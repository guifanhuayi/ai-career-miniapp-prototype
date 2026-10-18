import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { UploadsService } from './uploads.service';

@Injectable()
export class UploadRetentionRunner implements OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}
  start() {
    if (this.timer) return;
    this.timer = setInterval(
      () =>
        void this.runOnce().catch(() =>
          process.stderr.write('private_image_cleanup_failed\n'),
        ),
      60_000,
    );
    this.timer.unref();
    void this.runOnce().catch(() =>
      process.stderr.write('private_image_cleanup_failed\n'),
    );
  }
  async runOnce() {
    if (this.pending) return this.pending;
    this.pending = this.uploads.cleanupExpired().then(() => undefined);
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
}
