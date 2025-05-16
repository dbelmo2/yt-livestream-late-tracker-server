import { Platform } from './Platform';

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  hp: number;
  isBystander: boolean;
  name: string;
  velocityY?: number;
  lastUpdated: number;
  isOnGround?: boolean;
}

export class ServerPlayer {
  private id: string;
  private x: number;
  private y: number;
  private hp: number = 100;
  private isBystander: boolean = true;
  private name: string;
  private velocityY: number = 0;
  private isOnGround: boolean = false;
  private lastUpdated: number;
  private platforms: Platform[] = [];
  private gameHeight: number;
  // Physics constants
  private readonly gravity: number = 0.6;
  private readonly maxFallSpeed: number = 9.8;
  private readonly updateThreshold: number = 100; // ms before server takes over
  
  constructor(id: string, x: number, y: number, name: string, gameHeight: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name;
    this.lastUpdated = Date.now();
    this.gameHeight = gameHeight;
    
  }


  public setPlatforms(platforms: Platform[]): void {
    this.platforms = platforms;
  }
  
public updateFromClient(x: number, y: number, velocityY: number): void {
  const wasOnGround = this.isOnGround;
  
  // Check if player has moved up from ground position
  if (wasOnGround && y < this.gameHeight && y < this.y) {
    this.isOnGround = false;
  }

  this.x = x;
  
  // Ensure player doesn't go below the game floor
  if (y >= this.gameHeight) {
    this.y = this.gameHeight;
    this.velocityY = 0;
    this.isOnGround = true;
  } else {
    this.y = y;
  }
  
  // Only update velocityY if provided by client
  if (velocityY !== undefined) {
    this.velocityY = velocityY;
  }
  
  // If player has upward velocity, they're not on the ground
  if (velocityY < 0) {
    this.isOnGround = false;
  }
  
  this.lastUpdated = Date.now();
}
  
  public update(): void {
    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdated;
    

    // Reset isOnGround if player is above the floor
    if (this.y < this.gameHeight && this.isOnGround) {
      this.isOnGround = false;
    }

    // Only apply physics if client hasn't updated recently
    // and player is not on ground
    if (timeSinceUpdate > this.updateThreshold && !this.isOnGround) {
      // Apply gravity

      this.velocityY += this.gravity;
      
      // Cap fall speed
      if (this.velocityY > this.maxFallSpeed) {
        this.velocityY = this.maxFallSpeed;
      }
      
      // Move player
      this.y += this.velocityY;
      
      // Check for floor collision
      if (this.y >= this.gameHeight) {
        this.y = this.gameHeight;
        this.velocityY = 0;
        this.isOnGround = true;
      } else {
        // Check platform collisions
        this.checkPlatformCollisions();
      }
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
      lastUpdated: this.lastUpdated,
      isOnGround: this.isOnGround
    };
  }
}