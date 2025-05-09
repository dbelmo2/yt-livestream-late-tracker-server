import { Socket } from 'socket.io';
import { Projectile } from '../game-logic/Projectile';
import logger from '../utils/logger';

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
        socket.on('shoot', ({ x, y }) => {
          logger.info(`Player ${socket.id} shot event triggered`);
          const p = this.players.get(socket.id);
          if (!p) return;
          
          const projectile = new Projectile(p.x, p.y, x, y, 12, 5000, 0.05, `proj-${Date.now()}-${Math.random()}`, p.id);
    
          this.projectiles.push(projectile);
        });
    
        socket.on('disconnect', () => {
          this.players.delete(socket.id);
          this.sockets = this.sockets.filter(s => s.id !== socket.id);
          if (this.sockets.length === 0) this.cleanup();
        });
    }
  }

  // Called every frame
  private update() {
    // Move projectiles
    // update all projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const projectile = this.projectiles[i];
        projectile.update();
        if (projectile.shouldBeDestroyed) {
          this.projectiles.splice(i, 1);
          continue;
        } 
        this.projectileStates.push({ 
            ownerId: projectile.getOwnerId(),
            id: projectile.getId(),
            x: projectile.getX(),
            y: projectile.getY(),
            vx: projectile.getVX(),
            vy: projectile.getVY()
        });
    }

    // TODO: Optional - remove off-screen projectiles, handle collisions

    // Broadcast full game state
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
