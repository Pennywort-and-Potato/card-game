import { Container } from "pixi.js";
import type { SceneName, SceneParams } from "../types";

export interface SceneContainer extends Container {
  __teardown?: () => void;
}

type SceneFactory = (
  manager: SceneManager,
  params: SceneParams,
) => SceneContainer;

export class SceneManager {
  private readonly stage: Container;
  private readonly factories = new Map<SceneName, SceneFactory>();
  private current: SceneContainer | null = null;

  constructor(stage: Container) {
    this.stage = stage;
  }

  register(name: SceneName, factory: SceneFactory): this {
    this.factories.set(name, factory);
    return this;
  }

  goto(name: SceneName, params: SceneParams = {}): void {
    if (this.current) {
      this.current.__teardown?.();
      this.stage.removeChild(this.current);
      this.current.destroy({ children: true });
    }
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`Scene not registered: "${name}"`);
    this.current = factory(this, params);
    this.stage.addChild(this.current);
  }
}
