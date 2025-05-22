import e from 'express';
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

export class ServerPlayer {
  private speed: number = 10;
  private jumpStrength: number = 15;
  private maxAccelerationY: number = 9.8;
  private id: string;
  private x: number;
  private y: number;
  private hp: number = 100;
  private isBystander: boolean = true;
  private name: string;
  private velocityY: number = 0;
  private isOnGround: boolean = false;
  private platforms: Platform[] = [];
  private gameHeight: number;
  private gameWidth: number; // Default width, can be set later
  private canDoubleJump: boolean = true;
  private controller: Controller;

  // Physics constants
  private readonly gravity: number = 0.6;
  private readonly maxFallSpeed: number = 9.8;
  private readonly updateThreshold: number = 100; // ms before server takes over
  
  constructor(id: string, x: number, y: number, name: string, gameHeight: number, gameWidth: number, controller: Controller) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name;
    this.gameHeight = gameHeight;
    this.gameWidth = gameWidth
    this.controller = controller;
  }


  public setPlatforms(platforms: Platform[]): void {
    this.platforms = platforms;
  }
  
  public isMoving = false;
  public updateCount = 0;
  public timestamp: number = 0;
  public update(): void {
    // Update position based on input

    if (!this.controller.keys.left.pressed && !this.controller.keys.right.pressed) {
        this.isMoving = false;
        if (this.updateCount > 0) {
          console.log(`Update count: ${this.updateCount}`);
        }
        this.updateCount = 0;
    }


    if (this.controller.keys.left.pressed) {
        this.isMoving = true;
        let xPos = Math.max(0, this.x - (this.speed));
        if (xPos <= 25) xPos = 25; // This is needed for cube sprites as their pivot is the center.
        this.x = xPos;
    }
    if (this.controller.keys.right.pressed) {
        this.isMoving = true;
        let xPos = Math.min(this.gameWidth, this.x + (this.speed));
        if (xPos >= this.gameWidth - 25) xPos = this.gameWidth - 25; // This is needed for cube sprites as their pivot is the center.
        this.x = xPos;
    }

    if (this.isMoving) {
      this.updateCount++;
    }

    const wasOnGround = this.isOnGround;


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


    // Apply gravity
    this.velocityY += this.gravity;
    this.velocityY = Math.min(this.velocityY, this.maxAccelerationY); // Limit max fall speed
    this.y += this.velocityY;

    // Check vertical bounds
    // Floor collision
    if (this.y >= this.gameHeight) {
        this.y = this.gameHeight;
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
  
  private checkPlatformCollisions(): void {
    // Simple platform collision - similar to client-side but simplified
    for (const platform of this.platforms) {
      // Check if player is above platform and falling
      if (this.velocityY > 0) {
        const playerBottom = this.y;
        const playerLeft = this.x - 25;
        const playerRight = this.x + 25;
        
        const platformTop = platform.y;
        const platformLeft = platform.x;
        const platformRight = platform.x + platform.width;
        
        // Previous position
        const prevBottom = playerBottom - this.velocityY;
        
        // Check if we're falling onto the platform
        if (prevBottom <= platformTop && 
            playerBottom >= platformTop &&
            playerRight > platformLeft && 
            playerLeft < platformRight) {
          
          this.y = platformTop;
          this.velocityY = 0;
          this.isOnGround = true;
          break;
        }
      }
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

  public getController(): Controller {
    return this.controller;
  }
}