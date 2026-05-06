import fs from 'fs-extra';
import path from 'node:path';
import { app } from 'electron';

export class JsonStore<T extends object> {
  private readonly filePath: string;
  private readonly defaults: T;

  constructor(name: string, defaults: T) {
    this.filePath = path.join(app.getPath('userData'), `${name}.json`);
    this.defaults = defaults;
  }

  async getAll(): Promise<T> {
    await fs.ensureDir(path.dirname(this.filePath));
    if (!(await fs.pathExists(this.filePath))) {
      await this.write(this.defaults);
      return { ...this.defaults };
    }

    const data = await fs.readJson(this.filePath);
    return {
      ...this.defaults,
      ...(data as Partial<T>)
    };
  }

  async set(patch: Partial<T>) {
    const current = await this.getAll();
    await this.write({
      ...current,
      ...patch
    });
  }

  private async write(value: T) {
    await fs.writeJson(this.filePath, value, { spaces: 2 });
  }
}
