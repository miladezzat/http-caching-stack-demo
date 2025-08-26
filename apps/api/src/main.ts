
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpCacheInterceptor } from './common/http-cache.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new HttpCacheInterceptor(reflector));
  await app.listen(process.env.PORT || 3000);
  console.log(`API on http://localhost:${process.env.PORT || 3000}`);
}
bootstrap();
