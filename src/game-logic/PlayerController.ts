const keyMap: Record<string, keyof Controller['keys']> = {
  Space: 'space',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyD: 'right',
  ArrowRight: 'right',
};

export class Controller {
  public readonly keys: Record<
    'up' | 'down' | 'left' | 'right' | 'space',
    { pressed: boolean; doubleTap: boolean; timestamp: number }
  >;

  public readonly mouse: {
    pressed: boolean;
    x: number | undefined,
    y: number | undefined,
    xR: number | undefined,
    yR: number | undefined,
    justReleased: boolean
  };
  
  constructor() {
    this.keys = {
      up: { pressed: false, doubleTap: false, timestamp: 0 },
      down: { pressed: false, doubleTap: false, timestamp: 0 },
      left: { pressed: false, doubleTap: false, timestamp: 0 },
      right: { pressed: false, doubleTap: false, timestamp: 0 },
      space: { pressed: false, doubleTap: false, timestamp: 0 },
    };
    
    this.mouse = { pressed: false, x: undefined, y: undefined, justReleased: false, xR: undefined, yR: undefined };
  }

  private downTime = 0;
  public keyDownHandler(eventCode: string): void {
    console.log('keyDownHandler', eventCode);
    const key = keyMap[eventCode];
    if (!key) return;

    const now = Date.now();
    this.downTime = now;
    const state = this.keys[key];

    state.doubleTap = state.doubleTap || now - state.timestamp < 500;
    state.pressed = true;
    console.log(`Finished keyDownHandler for ${key}`, state);
  }

  public keyUpHandler(eventCode: string): void {
    console.log('keyUpHandler', eventCode);
    const key = keyMap[eventCode];
    if (!key) return;


    const totalTime = Date.now() - this.downTime;
    console.log('totalTime key was down', totalTime);

    const now = Date.now();
    const state = this.keys[key];

    state.pressed = false;

    if (state.doubleTap) {
      state.doubleTap = false;
    } else {
      state.timestamp = now;
    }
  }
  
  private mouseDownHandler(_: MouseEvent): void {
    // Check if it's a left click (main button)
    if (_.button !== 0) return;
    this.mouse.pressed = true;
    this.mouse.x = _.clientX;
    this.mouse.y = _.clientY;
  }

  private mouseUpHandler(_: MouseEvent): void {
    if (_.button !== 0) return;

    this.mouse.pressed = false;
    this.mouse.justReleased = true;
    this.mouse.xR = _.clientX;
    this.mouse.yR = _.clientY;
  }

  public resetMouse(): void {
    this.mouse.pressed = false;
    this.mouse.x = undefined;
    this.mouse.y = undefined;
    this.mouse.justReleased = false;
    this.mouse.xR = undefined;
    this.mouse.yR = undefined;
  }

    // Add a new method to handle window blur
  private handleBlur(): void {
    // Reset all key states when window loses focus
    for (const key in this.keys) {
      const keyName = key as keyof typeof this.keys;
      this.keys[keyName].pressed = false;
    }
    
    // Also reset mouse statea
    this.resetMouse();
  }

  // Add handler for context menu (right-click)
  private contextMenuHandler(event: MouseEvent): void {
    // Reset key states (same as blur handler)
    for (const key in this.keys) {
      const keyName = key as keyof typeof this.keys;
      this.keys[keyName].pressed = false;
    }
    this.resetMouse();
  }
}
