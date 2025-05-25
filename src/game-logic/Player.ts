import logger from '../utils/logger';
import { Platform } from './Platform';
import { Controller } from './PlayerController';

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  hp: number;
  isBystander: boolean;
  name: string;
  velocityY?: number;
  isOnGround?: boolean;
}

export interface KeyboardEvent {
  type: string;
  key: string;
}

export interface MouseEvent {
  type: string;
  x: number;
  y: number;
}

export interface PlayerInput {
  seq: number,
  event: MouseEvent | KeyboardEvent
}

export class Player {
  private readonly GAME_WIDTH: number;
  private readonly GAME_HEIGHT: number;
  private readonly MAX_ACCELERATION: number = 9.8;
  private readonly GRAVITY: number = 0.6;

  private speed: number = 10;
  private jumpStrength: number = 15;
  private id: string;
  private hp: number = 100;
  private x: number;
  private y: number;
  private velocityY: number = 0;
  private isBystander: boolean = true;
  private name: string;
  private isOnGround: boolean = false;
  private platforms: Platform[] = [];
  private canDoubleJump: boolean = true;
  private inputQueue: PlayerInput[] = [];
  private controller: Controller;
  private lastProcessedInput: number = -1;

  // Physics constants
  constructor(
    id: string, 
    x: number, 
    y: number, 
    name: string, 
    gameHeight: number, 
    gameWidth: number, 
    controller: Controller
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name;
    this.controller = controller;
    this.GAME_HEIGHT = gameHeight;
    this.GAME_WIDTH = gameWidth
  }


  public queueInput(input: PlayerInput): void {
    // Check if the input is a duplicate of the last processed input
    if (this.lastProcessedInput === input.seq) {
      //return; // Ignore duplicate input
    }
    this.inputQueue.push(input);
    this.lastProcessedInput = input.seq; // Update the last processed input
  }

  public setPlatforms(platforms: Platform[]): void {
    this.platforms = platforms;
  }
  
  public update(): void {
    if (this.controller.keys.left.pressed) {
        let xPos = Math.max(0, this.x - (this.speed));
        if (xPos <= 25) xPos = 25; // This is needed for cube sprites as their pivot is the center.
        this.x = xPos;
    }
    if (this.controller.keys.right.pressed) {
        let xPos = Math.min(this.GAME_WIDTH, this.x + (this.speed));
        if (xPos >= this.GAME_WIDTH - 25) xPos = this.GAME_WIDTH - 25; // This is needed for cube sprites as their pivot is the center.
        this.x = xPos;
    }

    // Jumping from ground or platform
    if ((this.controller.keys.space.pressed || this.controller.keys.up.pressed) && this.isOnGround) {
      this.velocityY = -this.jumpStrength;
      this.isOnGround = false;

      // Reset double tap flags to prevent immediate double jump
      this.controller.keys.space.doubleTap = false;
      this.controller.keys.up.doubleTap = false;
    }

    // Double jump logic, utilizes doubleJump from the controller. 
    // Might need to tweak the doubleJump time window in the controller depending on jump animation time duration. 
    if (!this.isOnGround && this.canDoubleJump) {
      if (this.controller.keys.space.doubleTap || this.controller.keys.up.doubleTap) {
        this.velocityY = -this.jumpStrength;
        this.canDoubleJump = false;
        // Clear double tap flags after use
        this.controller.keys.space.doubleTap = false;
        this.controller.keys.up.doubleTap = false;
      }
    }


    // Horizontal movement
    const wasOnGround = this.isOnGround;
    // TODO: Investigate whether the gravity could should be moved elsewhere...
    // Concerned about the fact that the rate at which a player falls could vary..
    // Apply gravity
    this.velocityY += this.GRAVITY;
    this.velocityY = Math.min(this.velocityY, this.MAX_ACCELERATION); // Limit fall speed
    this.y += this.velocityY;

    // Floor collision
    if (this.y >= this.GAME_HEIGHT) {
        this.y = this.GAME_HEIGHT;
        this.velocityY = 0;
        this.isOnGround = true;
        this.canDoubleJump = true; // Reset double jump when on ground
    }

    // Ceiling collision
    if (this.y <= 0) {
        this.y = 0;
        this.velocityY = 0;
    }
    
    // Floor collision
    let isOnSurface = this.isOnGround;

    // Check platform collisions
    for (const platform of this.platforms) {
      const platformBounds = {
        left: platform.x,
        right: platform.x + platform.width,
        top: platform.y,
        bottom: platform.y + platform.height
      };

      const playerBounds = {
        left: this.x - 25,
        right: this.x + 25,
        top: this.y - 50,
        bottom: this.y // Assuming player height is 50
      }
      
      // Calculate the previous position based on velocity
      const prevBottom = playerBounds.bottom - this.velocityY;
      
      // Check for platform collision with tunneling prevention
      const isGoingDown = this.velocityY > 0;
      const wasAbovePlatform = prevBottom <= platformBounds.top;
      const isWithinPlatformWidth = playerBounds.right > platformBounds.left && 
      playerBounds.left < platformBounds.right;
      const hasCollidedWithPlatform = playerBounds.bottom >= platformBounds.top;
      
      // Check if we're falling, were above platform last frame, and are horizontally aligned
      if (isGoingDown && wasAbovePlatform && isWithinPlatformWidth && hasCollidedWithPlatform) {
          this.y = platformBounds.top;
          this.velocityY = 0;
          isOnSurface = true;
          break;
      }
    }

    this.isOnGround = isOnSurface;
    if (isOnSurface && !wasOnGround) {
        this.canDoubleJump = true;
    }
  }
  

  private handleKeyboardEvent({ type, key }: KeyboardEvent): void {  
    console.log(`Handling keyboard event: ${type}, key: ${key}`);
    if (type === 'keyDown') {
      this.controller.keyDownHandler(key);
    } else if (type === 'keyUp') {
      this.controller.keyUpHandler(key);
    } else {
      logger.error(`Unknown event type: ${type}`);  
    }
  }


  public setIsBystander(value: boolean): void {
    this.isBystander = value;
  }
  
  public getIsBystander(): boolean {
    return this.isBystander;
  }
    
  public damage(amount: number = 10): void {
    this.hp = Math.max(0, this.hp - amount);
  }
  
  public heal(amount: number): void {
    this.hp = Math.min(100, this.hp + amount);
  }
  
  public resetHealth(): void {
    this.hp = 100;
  }
  
  public getId(): string {
    return this.id;
  }
  public getX(): number {
    return this.x;
  }
  public getY(): number {
    return this.y;
  }
  public getHp(): number {
    return this.hp;
  }

  public getName(): string {
    return this.name;
  }

  public getState(): PlayerState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      hp: this.hp,
      isBystander: this.isBystander,
      name: this.name,
      velocityY: this.velocityY,
      isOnGround: this.isOnGround
    };
  }

  public integrateInput(): void {
    const max = 1;
    let numIntegrations = 0;
    //console.log('Integrating input. Queue length:', this.inputQueue.length);
    while (this.inputQueue.length > 0 && numIntegrations < max) {
      const input = this.inputQueue.shift();
      const inputEvent = input?.event
      console.log(`Integrating input: ${JSON.stringify(inputEvent)}`);
      if (!inputEvent || !inputEvent.type) return;
      // Determine event type and handle accordingly
      if (inputEvent.type === 'keyDown' || inputEvent.type === 'keyUp') {
        this.handleKeyboardEvent(inputEvent as KeyboardEvent);
      } // TODO: Handle mouse events similarly
      numIntegrations++;
    }
    //console.log('Integrated input. Remaining queue length:', this.inputQueue.length);
  }


 
  



}