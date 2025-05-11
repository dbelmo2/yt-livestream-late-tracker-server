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

export type PlayerScore = {
  kills: number;
  deaths: number;
};

const MAX_KILL_AMOUNT = 2; // Adjust this value as needed


export class Match {
  private id: string;
  private players: Map<string, PlayerState> = new Map();
  private projectiles: Projectile[] = [];
  private interval: NodeJS.Timeout;
  private projectileStates: ProjectileState[] = [];
  private timeoutIds: Set<NodeJS.Timeout> = new Set();
  private startingX = 100;
  private startingY = 100;
  private totalCollisions = 0;
  private playerScores: Map<string, PlayerScore> = new Map();


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
        this.players.set(socket.id, {
          id: socket.id,
          x: this.startingX,
          y: this.startingY,
          hp: 100,
        });

        // Initialize player score
        this.playerScores.set(socket.id, {
          kills: 0,
          deaths: 0,
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
          
          const projectile = new Projectile(p.x, p.y, x, y, 30, 5000, 0.05, id, p.id);
          logger.info(`Player ${socket.id} shot event triggered with projectile id: ${id}`);

          this.projectiles.push(projectile);
        });
    
        socket.on('disconnect', () => {
         this.players.delete(socket.id);
          this.playerScores.delete(socket.id); // Remove scores when player disconnects
          this.sockets = this.sockets.filter(s => s.id !== socket.id);
          if (this.sockets.length === 0) this.cleanup();
        });
    }
  }

  private checkWinCondition() {
    const sortedScores = Array.from(this.playerScores.entries())
      .map(([playerId, score]) => ({
        playerId,
        ...score
      }))
      .sort((a, b) => b.kills - a.kills);

    const winner = sortedScores[0];
    
    if (winner && winner.kills >= MAX_KILL_AMOUNT) {
      // Emit game over event with sorted scores
      for (const socket of this.sockets) {
        socket.emit('gameOver', sortedScores);
      }
      
      // Clean up the match
      this.cleanup();
    }
  }

  private update() {
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
          this.totalCollisions++;
          logger.info(`Collision: ${projectile.getId()} hit ${player.id}`);
          player.hp -= 10;
          projectile.shouldBeDestroyed = true;

          if (player.hp <= 0) {
            this.players.delete(player.id);
            // Update death count for killed player
            const killedPlayerScore = this.playerScores.get(player.id);
            if (killedPlayerScore) {
              killedPlayerScore.deaths++;
            }
            // Update kill count for shooter
            const shooterScore = this.playerScores.get(projectile.getOwnerId());
            if (shooterScore) {
              shooterScore.kills++;
              this.checkWinCondition();
            }

            const id = setTimeout(() => {
              this.players.set(player.id, {
                id: player.id,
                x: this.startingX,
                y: this.startingY,
                hp: 100,
              });
              this.timeoutIds.delete(id);
            }, 3000);
            this.timeoutIds.add(id);
          }
          break;
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
      scores: Array.from(this.playerScores.entries()).map(([playerId, score]) => ({
        playerId,
        ...score
      }))
    };
  
    for (const socket of this.sockets) {
      socket.emit('stateUpdate', gameState);
    }
    //logger.info(`Total collisions: ${this.totalCollisions}`);
    this.projectileStates = [];
  }
  
  

  private cleanup() {
    clearInterval(this.interval);
    for (const id of this.timeoutIds) {
      clearTimeout(id);
    }
    for (const socket of this.sockets) {
      socket.removeAllListeners('playerInput');
      socket.removeAllListeners('shoot');
    }
    logger.info(`Match ${this.id} ended and cleaned up`);
  }
}
