import { Socket } from 'socket.io';
import { Projectile } from '../game-logic/Projectile';
import logger from '../utils/logger';
import { 
  testForAABB,
  PROJECTILE_WIDTH,
  PROJECTILE_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT
} from '../game-logic/collision';


type Region = 'NA' | 'EU' | 'ASIA' | 'GLOBAL';

export type PlayerState = {
  id: string;
  x: number;
  y: number;
  hp: number;
};

export type ProjectileState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
};

export class Match {
  private id: string;
  private players: Map<string, PlayerState> = new Map();
  private projectiles: Projectile[] = [];
  private interval: NodeJS.Timeout;
  private projectileStates: ProjectileState[] = [];

  constructor(
    public sockets: Socket[],
    public region: Region,
    id = `match-${Math.random().toString(36).substring(2, 8)}`
  ) {
    
    this.id = id;

    // Initialize match loop at 60 FPS
    this.interval = setInterval(() => this.update(), 1000 / 60);
  }

  // Add a player to this match
  initialize() {
    for (const socket of this.sockets) {
        const startingX = 100 + Math.random() * 400;
        const startingY = 100;
    
        this.players.set(socket.id, {
          id: socket.id,
          x: startingX,
          y: startingY,
          hp: 100,
        });
    
        // Listen for player input
        socket.on('playerInput', ({ x, y }) => {
          const p = this.players.get(socket.id);
          if (p) {
            p.x = x;
            p.y = y;
          }
        });
    
        // Listen for shooting
        socket.on('shoot', ({ x, y, id }) => {
          const p = this.players.get(socket.id);
          if (!p) return;
          
          const projectile = new Projectile(p.x, p.y, x, y, 5, 5000, 0.05, id, p.id);
          logger.info(`Player ${socket.id} shot event triggered with projectile id: ${id}`);

          this.projectiles.push(projectile);
        });
    
        socket.on('disconnect', () => {
          this.players.delete(socket.id);
          this.sockets = this.sockets.filter(s => s.id !== socket.id);
          if (this.sockets.length === 0) this.cleanup();
        });
    }
  }

  private update() {
    const now = Date.now();
  
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.update();
  
      // Check for off-screen or expired
      if (projectile.shouldBeDestroyed) {
        console.log(`Projectile ${projectile.getId()} destroyed due to flag`);
        this.projectiles.splice(i, 1);
        continue;
      }
  
      // Check for collisions
      for (const player of this.players.values()) {
        if (projectile.getOwnerId() === player.id) continue;
  
        const projectileRect = {
          x: projectile.getX() - PROJECTILE_WIDTH / 2,
          y: projectile.getY() - PROJECTILE_HEIGHT / 2,
          width: PROJECTILE_WIDTH,
          height: PROJECTILE_HEIGHT,
        };
  
        const playerRect = {
          x: player.x - PLAYER_WIDTH / 2,
          y: player.y - PLAYER_HEIGHT,
          width: PLAYER_WIDTH,
          height: PLAYER_HEIGHT,
        };
  
        if (testForAABB(projectileRect, playerRect)) {
          logger.info(`Collision: ${projectile.getId()} hit ${player.id}`);
          player.hp -= 10;
          projectile.shouldBeDestroyed = true;
  
          if (player.hp <= 0) {
            this.players.delete(player.id);
            this.sockets = this.sockets.filter(s => s.id !== player.id);
            if (this.sockets.length === 0) this.cleanup();
          }
  
          break; // One hit for projectile, no need to check other players after first hit.
        }
      }
  
      // Collect projectile state for broadcast
      if (!projectile.shouldBeDestroyed) {
        this.projectileStates.push({
          ownerId: projectile.getOwnerId(),
          id: projectile.getId(),
          x: projectile.getX(),
          y: projectile.getY(),
          vx: projectile.getVX(),
          vy: projectile.getVY(),
        });
      } else {
        this.projectiles.splice(i, 1); // remove after state capture
      }
    }
  
    const gameState = {
      players: Array.from(this.players.values()),
      projectiles: this.projectileStates,
    };
  
    for (const socket of this.sockets) {
      socket.emit('stateUpdate', gameState);
    }
  
    this.projectileStates = [];
  }
  

  private cleanup() {
    clearInterval(this.interval);
    console.log(`Match ${this.id} ended and cleaned up`);
  }
}
