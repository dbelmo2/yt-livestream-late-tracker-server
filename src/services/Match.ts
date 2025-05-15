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
import { ServerPlayer } from '../game-logic/ServerPlayer';
import { Platform } from '../game-logic/Platform';


type Region = 'NA' | 'EU' | 'ASIA' | 'GLOBAL';


export type PlayerState = {
  id: string;
  x: number;
  y: number;
  hp: number;
  isBystander: boolean;
  name: string;
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
  name: string;
};


const MAX_KILL_AMOUNT = 2; // Adjust this value as needed

export class Match {
  private readonly GAME_WIDTH = 1920;  // Fixed game width
  private readonly GAME_HEIGHT = 1080; // Fixed game height

  private id: string;
  private players: Map<string, ServerPlayer> = new Map();
  private projectiles: Projectile[] = [];
  private interval: NodeJS.Timeout | null = null;
  private projectileStates: ProjectileState[] = [];
  private timeoutIds: Set<NodeJS.Timeout> = new Set();
  private startingX = 100;
  private startingY = 100;
  private totalCollisions = 0;
  private playerScores: Map<string, PlayerScore> = new Map();
  private sockets: Socket[] = [];
  private region: Region;
  private respawnQueue: Map<string, string> = new Map();
  private matchIsActive = true;

  private platforms: Platform[] = []

  constructor(
    socket: Socket,
    region: Region,
    id = `match-${Math.random().toString(36).substring(2, 8)}`,
    public matches: Map<string, Match> = new Map(),
    firstPlayerName: string = 'Player 1'
  ) {
    this.id = id;
    this.sockets = [socket];
    this.region = region;



    this.initializePlatforms()


    this.initalizeFirstPlayer(socket, firstPlayerName);
    this.setUpPlayerSocketHandlers(this.sockets);
    // Start game loop loop (this will broadcast the game state to all players)
    this.interval = setInterval(() => this.update(), 1000 / 60); 
  }



  public addPlayer(socket: Socket, name: string): void {
    this.sockets.push(socket);
    
    const serverPlayer = new ServerPlayer(socket.id, this.startingX, this.startingY, name, this.GAME_HEIGHT);
    serverPlayer.setPlatforms(this.platforms);
    // Initialize new player as bystander
    this.players.set(socket.id, serverPlayer);

    this.playerScores.set(socket.id, {
      kills: 0,
      deaths: 0,
      name
    });

    this.setUpPlayerSocketHandlers([socket]);
    


    // Inform new player of current game state
    socket.emit('stateUpdate', {
      players: this.getPlayerStates(),
      projectiles: this.projectileStates,
      scores: Array.from(this.playerScores.entries())
        .map(([playerId, score]) => ({
          playerId,
          ...score
        }))
    });
  }

  public getId(): string {
    return this.id;
  } 

  public getRegion(): Region {
    return this.region;
  }

  private handleToggleBystander(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.setIsBystander(false);
    logger.info(`Player ${playerId} is no longer a bystander`);
  }

  private initalizeFirstPlayer(socket: Socket, name: string) {
    // Setup player state
    const newPlayer = new ServerPlayer(socket.id, this.startingX, this.startingY, name, this.GAME_HEIGHT);
    newPlayer.setPlatforms(this.platforms);
    this.players.set(socket.id, newPlayer);

    // Initialize player scores
    this.playerScores.set(socket.id, {
      kills: 0,
      deaths: 0,
      name
    });
  }

  private initializePlatforms(): void {
    // Initialize platforms here
    this.platforms = [
          new Platform(250, this.GAME_HEIGHT - 250),
          new Platform(this.GAME_WIDTH - 850, this.GAME_HEIGHT - 250),
          new Platform(250, this.GAME_HEIGHT - 500),
          new Platform(this.GAME_WIDTH - 850, this.GAME_HEIGHT - 500)

    ];
  }
  private setUpPlayerSocketHandlers(sockets: Socket[]) {
    for (const socket of sockets) {
      socket.on('playerInput', ({ x, y, vy }) => this.handlePlayerInput(socket.id, x, y, vy));
      socket.on('shoot', ({ x, y, id }) => this.handlePlayerShooting(socket.id, id, x, y));
      socket.on('toggleBystander', () => this.handleToggleBystander(socket.id));
      socket.on('disconnect', () => this.handlePlayerDisconnect(socket.id));
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

      this.matchIsActive = false;
      
      // Clear any pending respawn timeouts
      for (const id of this.timeoutIds) {
        clearTimeout(id);
      }

      // Respawn any players in the respawn queue

      for (const [playerId, playerName] of this.respawnQueue) {
        const respawningPlayer = new ServerPlayer(playerId, this.startingX, this.startingY, playerName, this.GAME_HEIGHT);
        respawningPlayer.setPlatforms(this.platforms);
        this.players.set(playerId, respawningPlayer);
      }

  
      for (const socket of this.sockets) {
        socket.emit('gameOver', sortedScores);
      }



      this.respawnQueue.clear();
      this.timeoutIds.clear();

      // Reset match.
      setTimeout(() => this.resetMatch(), 10000); // Wait 5 seconds before resetting

    }
  }

  private update() {
    const projectilesToRemove: number[] = [];

    // Update all players
    for (const player of this.players.values()) {
      player.update();
    }

    for (let i = 0; i < this.projectiles.length; i++) {
      const projectile = this.projectiles[i];
      projectile.update();
  
      // Check expired projectiles
      if (projectile.shouldBeDestroyed) {
        projectilesToRemove.push(i);
        continue;
      }
  
      // Check for collisions
      let collided = false;
      if (this.matchIsActive === true) {
        for (const player of this.players.values()) {
          if (projectile.getOwnerId() === player.getId() || player.getIsBystander()) continue;
          // TODO: Print victim location here for first projectile to compare with client data.
          const projectileRect = {
            x: projectile.getX() - PROJECTILE_WIDTH / 2,
            y: projectile.getY() - PROJECTILE_HEIGHT / 2,
            width: PROJECTILE_WIDTH,
            height: PROJECTILE_HEIGHT,
          };
    
          const playerRect = {
            x: player.getX() - PLAYER_WIDTH / 2,
            y: player.getY() - PLAYER_HEIGHT,
            width: PLAYER_WIDTH,
            height: PLAYER_HEIGHT,
          };
    
          collided = testForAABB(projectileRect, playerRect);
          if (collided) {
            logger.info(`Collision detected between projectile ${projectile.getId()} and player ${player.getId()}`);
            projectilesToRemove.push(i);
            this.handleCollision(projectile, player);
            break;
          }
        }
      }

      // Collect projectile state for broadcast
      if (!collided) {
        this.projectileStates.push({
          ownerId: projectile.getOwnerId(),
          id: projectile.getId(),
          x: projectile.getX(),
          y: projectile.getY(),
          vx: projectile.getVX(),
          vy: projectile.getVY(),
        });
      }
    }

    // Remove projectiles after all processing is done
    // Remove from end to start to maintain correct indices
    for (let i = projectilesToRemove.length - 1; i >= 0; i--) {
      this.projectiles.splice(projectilesToRemove[i], 1);
    }


    // Broadcast the game state to all players
    const gameState = {
        players: this.getPlayerStates(),
        projectiles: this.projectileStates,
        scores: Array.from(this.playerScores.entries()).map(([playerId, score]) => ({
          playerId,
          ...score
        }))
    };
  
    for (const socket of this.sockets) {
      socket.emit('stateUpdate', gameState);
    }
    this.projectileStates = [];
  }

  private handlePlayerDisconnect(playerId: string): void {
    this.players.delete(playerId);
    this.playerScores.delete(playerId);
    this.sockets = this.sockets.filter(s => s.id !== playerId);
    if (this.sockets.length === 0) this.cleanUpSession();
  }

  private handlePlayerShooting(
    playerId: string, 
    projectileId: string,
    x: number,
    y: number,
  ): void {
      const p = this.players.get(playerId);
      if (!p || p.getIsBystander()) return;
      
      const projectile = new Projectile(p.getX(), p.getY(), x, y, 30, 5000, 0.05, projectileId, p.getId());
      this.projectiles.push(projectile);
  }

  private handlePlayerInput(playerId: string, x: number, y: number, vy: number): void {
    const p = this.players.get(playerId);
    if (p) {
      p.updateFromClient(x, y, vy);
    }
  }

  private handleCollision(projectile: Projectile, player: ServerPlayer): void {
      if (player.getIsBystander()) return; // Prevent damage to bystanders
      this.totalCollisions++;
      logger.info(`Collision: ${projectile.getId()} hit ${player.getId()}`);
      player.damage(10);

      if (player.getHp() <= 0) {
        this.handlePlayerDeath(player.getId(), player.getName(), projectile.getOwnerId());
      }
      
  }

  private handlePlayerDeath(victimId: string, victimName: string, killerId: string) {
      this.players.delete(victimId);
      // Update death count for killed player
      const killedPlayerScore = this.playerScores.get(victimId);
      if (killedPlayerScore) {
        killedPlayerScore.deaths++;
      }
      // Update kill count for shooter
      const shooterScore = this.playerScores.get(killerId);
      if (shooterScore) {
        shooterScore.kills++;
        this.checkWinCondition();
      }

      this.scheulePlayerRespawn(victimId, victimName);
  }



  private scheulePlayerRespawn(playerId: string, playerName: string): void {

      this.respawnQueue.set(playerId, playerName);
      console.log(`Player ${playerId} is scheduled for respawn`);
      
      const id = setTimeout(() => {
        console.log(`Inside schedulePlayerRespawn timeout for player ${playerId}`);
        const needsRespawn = this.respawnQueue.has(playerId);
        console.log(`Player ${playerId} needs respawn: ${needsRespawn}`);
        if (needsRespawn === false) return; // Player is not in respawn queue
        this.respawnQueue.delete(playerId);
        const player = new ServerPlayer(playerId, this.startingX, this.startingY, playerName, this.GAME_HEIGHT);
        player.setPlatforms(this.platforms);
        this.players.set(playerId, player);
        this.timeoutIds.delete(id);
      }, 3000);

      this.timeoutIds.add(id);
  }

  private resetMatch(): void {

    // Clear all active projectiles
    this.projectiles = [];
    this.projectileStates = [];
    
    // Reset round-specific state
    this.totalCollisions = 0;

    // Reset player health and scores but maintain positions and bystander status
    for (const [playerId, player] of this.players.entries()) {
      player.resetHealth();
      // Keep x, y positions and isBystander state
      
      // Reset scores for new round
      this.playerScores.set(playerId, {
        kills: 0,
        deaths: 0,
        name: player.getName()
      });
    }
    // Inform players of match reset
    for (const socket of this.sockets) {
      socket.emit('matchReset', {
        players: this.getPlayerStates(),
        scores: Array.from(this.playerScores.entries())
          .map(([playerId, score]) => ({
            playerId,
            ...score
          }))
      });
    }

    this.matchIsActive = true;

  }

  private handleError(error: Error, context: string): void {
    logger.error(`Error in Match ${this.id} - ${context}: ${error.message}`);
    // Could add additional error handling logic here
  }



  private getPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((player) => {
      const { id, x, y, hp, isBystander, name } = player.getState();
      return {
        id,
        x,
        y,
        hp,
        isBystander,
        name
      };
    });
  }

  
  private cleanUpSession() {
    this.matches.delete(this.id);
    if (this.interval) clearInterval(this.interval);
    for (const id of this.timeoutIds) {
      clearTimeout(id);
    }
    for (const socket of this.sockets) {
      socket.removeAllListeners('playerInput');
      socket.removeAllListeners('shoot');
      // We dont want to disconnect the socket here, just remove listeners for this match.
    }
        // Clear all game state
    this.players.clear();
    this.projectiles = [];
    this.projectileStates = [];
    this.timeoutIds.clear();
    this.playerScores.clear();
    
    // Ensure game loop variables are reset
    this.interval = null;
    this.totalCollisions = 0;


    logger.info(`Match ${this.id} ended and cleaned up \n\n`);
  }




}
