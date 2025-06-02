import logger from '../utils/logger';
import { Platform } from './Platform';
import { Controller } from './PlayerController';
import { InputPayload } from '../services/Match';
import { Vector2 } from './Vector';
export interface PlayerState {
  id: string;
  position: Vector2;
  hp: number;
  isBystander: boolean;
  name: string;
  velocity: Vector2;
  isOnGround?: boolean;
}
export class Player {
  public readonly SPEED = 750;
  public readonly JUMP_STRENGTH = 750;
  public readonly GRAVITY = 1500;
  public readonly MAX_FALL_SPEED = 1500;

  private id: string;
  private hp: number = 100;
  private x: number;
  private y: number;
  private velocity: Vector2 = new Vector2(0, 0);
  private isBystander: boolean = true;
  private name: string;
  private isOnGround: boolean = false;
  private platforms: Platform[] = [];
  private canDoubleJump: boolean = true;
  private inputQueue: InputPayload[] = [];
  private lastProcessedInput: number = 0;
  private gameBounds: { left: number; right: number; top: number; bottom: number } | null = null;
  private numTicksWithoutInput: number = 0;

  // Physics constants
  constructor(
    id: string, 
    x: number, 
    y: number, 
    name: string, 
    gameBounds: { left: number; right: number; top: number; bottom: number } | null = null
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.name = name;
    this.gameBounds = gameBounds;
  }


  public queueInput(input: InputPayload): void {
    this.inputQueue.push(input);
  }

  public setPlatforms(platforms: Platform[]): void {
    this.platforms = platforms;
  }
  

  public setLastProcessedInput(tick: number): void {
    this.lastProcessedInput = tick;
  }
  

  public getLastProcessedInput(): number {
    return this.lastProcessedInput;
  } 

  public getNumTicksWithoutInput(): number {
    return this.numTicksWithoutInput;
  }

  public update(inputVector: Vector2, dt: number): void {
     // console.log(`Player ${this.id} update called with inputVector: ${inputVector.x}, ${inputVector.y} and dt: ${dt}`);
      //const wasOnGround = this.isOnGround;
      if (inputVector.x === 0 && inputVector.y === 0) {
          this.numTicksWithoutInput++;
      } else {
          this.numTicksWithoutInput = 0; // Reset if we have input
      }
      
      // 1. First we update our velocity vector based on input and physics.
      // Horizontal Movement
      if (inputVector.x !== 0) {
        //inputVector.normalize();
        this.velocity.x = inputVector.x * this.SPEED;
      } else {
        this.velocity.x = 0;
      }

      // Jumping
      if ((inputVector.y < 0 && this.isOnGround) || (inputVector.y < 0 && this.canDoubleJump)) {
        this.velocity.y = inputVector.y * this.JUMP_STRENGTH;
        this.canDoubleJump = this.isOnGround;
        this.isOnGround = false;
      }



      // Gravity
      this.velocity.y += this.GRAVITY * dt;
      this.velocity.y = Math.min(this.velocity.y, this.MAX_FALL_SPEED); 


      // 2. Once the velocity is updated, we calculate the new position.
      const newX = this.x + (this.velocity.x * dt);
      const newY = this.y + (this.velocity.y * dt);

      // 3. Now we clamp the position to the game bounds.
      if (this.gameBounds) {
          this.x = Math.max(this.gameBounds.left + 25, Math.min(newX, this.gameBounds.right - 25)); // 50 is the width of the player
          this.y = Math.max(this.gameBounds.top, Math.min(newY, this.gameBounds.bottom)); // 50 is the height of the player
      } else {
          this.x = newX;
          this.y = newY;
      }

      // 4. Finally, we reset the relevant variables when on the ground
      if (this.y === this.gameBounds?.bottom) {
          this.isOnGround = true;
          this.canDoubleJump = true; // Reset double jump when on ground
          this.velocity.y = 0; // Reset vertical velocity when on ground
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
      hp: this.hp,
      isBystander: this.isBystander,
      name: this.name,
      velocity: this.velocity,
      position: new Vector2(this.x, this.y),
      isOnGround: this.isOnGround,
    };
  }

  public getInputQueueLength(): number {
    return this.inputQueue.length;
  }

  public dequeueInput(): InputPayload | undefined {
    if (this.inputQueue.length === 0) {
      return undefined;
    }
    const input = this.inputQueue.shift();
    return input;
  } 


}