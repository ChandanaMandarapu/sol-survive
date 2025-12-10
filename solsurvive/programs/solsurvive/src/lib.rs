use anchor_lang::prelude::*;

declare_id!("5mJUgVeCnRaXHY45RhTfrg7DVnWoVYRSYShZWFVFHgF6");

#[program]
pub mod solsurvive {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        // Transfer 0.05 SOL from player to game account
        let transfer_amount = 50_000_000; 
        
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: game.to_account_info(),
                },
            ),
            transfer_amount,
        )?;
        
        // Initialize game state
        game.player = ctx.accounts.player.key();
        game.player_x = 5;
        game.player_y = 5;
        game.player_alive = true;
        
        // Initialize 9 AI bots at fixed positions
        game.ai_x = [1, 9, 1, 9, 5, 1, 9, 5, 5];
        game.ai_y = [1, 1, 9, 9, 1, 5, 5, 9, 3];
        game.ai_alive = [true; 9];
        game.ai_personality = [0, 1, 2, 3, 0, 1, 2, 0, 3];
        
        game.round = 1;
        game.safe_zone_radius = 5;
        game.prize_pool = transfer_amount;
        game.game_over = false;
        game.bump = ctx.bumps.game;
        
        // Powerup system
        game.powerup_x = 255;
        game.powerup_y = 255;
        game.powerup_type = 0;
        game.powerup_active = false;
        
        // Player inventory
        game.player_shield = false;
        game.player_speed_boost = 0;
        game.player_freeze_rounds = 0;
        
        // Combo system
        game.combo_count = 0;
        game.combo_multiplier = 1;
        
        // Stats tracking
        game.total_moves = 0;
        game.ai_killed = 0;
        game.powerups_collected = 0;
        
        msg!("Game initialized! Player at (5,5). 9 AI spawned.");
        Ok(())
    }
    
    pub fn move_player(ctx: Context<MovePlayer>, new_x: u8, new_y: u8) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(!game.game_over, GameError::GameIsOver);
        require!(game.player_alive, GameError::PlayerDead);
        require!(new_x < 10 && new_y < 10, GameError::OutOfBounds);
        
        let max_distance = if game.player_speed_boost > 0 { 3 } else { 1 };
        
        let dx = (new_x as i16 - game.player_x as i16).abs();
        let dy = (new_y as i16 - game.player_y as i16).abs();
        require!(dx + dy <= max_distance && dx + dy > 0, GameError::InvalidMove);
        
        game.player_x = new_x;
        game.player_y = new_y;
        game.total_moves += 1;
        
        // Consume speed boost
        if game.player_speed_boost > 0 {
            game.player_speed_boost -= 1;
        }
        
        // Check powerup collection
        if game.powerup_active && game.powerup_x == new_x && game.powerup_y == new_y {
            game.powerup_active = false;
            game.powerups_collected += 1;
            
            match game.powerup_type {
                1 => { // Speed boost
                    game.player_speed_boost = 3;
                    msg!("Speed boost collected!");
                },
                2 => { // Shield
                    game.player_shield = true;
                    msg!("Shield activated!");
                },
                3 => { // Bomb - kill nearby AI
                    for i in 0..9 {
                        if !game.ai_alive[i] { continue; }
                        let dist = ((game.ai_x[i] as i16 - new_x as i16).abs() + 
                                   (game.ai_y[i] as i16 - new_y as i16).abs()) as u8;
                        if dist <= 2 {
                            game.ai_alive[i] = false;
                            game.ai_killed += 1;
                            msg!("AI {} bombed!", i);
                        }
                    }
                },
                4 => { // Freeze
                    game.player_freeze_rounds = 2;
                    msg!("AI frozen for 2 rounds!");
                },
                5 => { // Bonus SOL
                    game.prize_pool += 10_000_000; // +0.01 SOL
                    msg!("Bonus SOL collected!");
                },
                _ => {}
            }
        }
        
        msg!("Player moved to ({}, {})", new_x, new_y);
        Ok(())
    }
    
    pub fn process_ai_turn(ctx: Context<ProcessAITurn>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(!game.game_over, GameError::GameIsOver);
        
        // Skip AI movement if frozen
        if game.player_freeze_rounds > 0 {
            msg!("AI frozen this round!");
            return Ok(());
        }
        
        let mut collision_detected = false;
        
        // Move each alive AI
        for i in 0..9 {
            if !game.ai_alive[i] { continue; }
            
            let personality = game.ai_personality[i];
            let mut target_x = 5_u8;
            let mut target_y = 5_u8;
            
            // Enhanced AI logic
            let player_dist = ((game.ai_x[i] as i16 - game.player_x as i16).abs() + 
                              (game.ai_y[i] as i16 - game.player_y as i16).abs()) as u8;
            
            match personality {
                0 => { // Aggressive - chase player aggressively
                    if player_dist > 3 {
                        target_x = game.player_x;
                        target_y = game.player_y;
                    } else {
                        // Smart pursuit: predict player movement
                        let dx = game.player_x as i16 - game.ai_x[i] as i16;
                        let dy = game.player_y as i16 - game.ai_y[i] as i16;
                        target_x = (game.player_x as i16 + dx.signum()).clamp(0, 9) as u8;
                        target_y = (game.player_y as i16 + dy.signum()).clamp(0, 9) as u8;
                    }
                },
                1 => { // Defensive - stay in safe zone center
                    let center_dist = ((game.ai_x[i] as i16 - 5).abs() + 
                                      (game.ai_y[i] as i16 - 5).abs()) as u8;
                    if center_dist > game.safe_zone_radius - 1 {
                        target_x = 5;
                        target_y = 5;
                    } else if player_dist < 3 {
                        // Escape if player too close
                        let dx = game.ai_x[i] as i16 - game.player_x as i16;
                        let dy = game.ai_y[i] as i16 - game.player_y as i16;
                        target_x = (game.ai_x[i] as i16 + dx.signum()).clamp(0, 9) as u8;
                        target_y = (game.ai_y[i] as i16 + dy.signum()).clamp(0, 9) as u8;
                    }
                },
                2 => { // Coward - run from everything
                    let dx = game.ai_x[i] as i16 - game.player_x as i16;
                    let dy = game.ai_y[i] as i16 - game.player_y as i16;
                    target_x = (game.ai_x[i] as i16 + dx.signum() * 2).clamp(0, 9) as u8;
                    target_y = (game.ai_y[i] as i16 + dy.signum() * 2).clamp(0, 9) as u8;
                },
                _ => { // Chaos - semi-random but aware
                    let clock = Clock::get()?;
                    let random = (clock.unix_timestamp as u64 + i as u64) % 8;
                    
                    if player_dist < 2 && random < 4 {
                        // Sometimes chase if close
                        target_x = game.player_x;
                        target_y = game.player_y;
                    } else {
                        // Random direction
                        match random {
                            0 => target_y = game.ai_y[i].saturating_sub(1),
                            1 => target_y = (game.ai_y[i] + 1).min(9),
                            2 => target_x = game.ai_x[i].saturating_sub(1),
                            3 => target_x = (game.ai_x[i] + 1).min(9),
                            4 => { target_x = game.ai_x[i].saturating_sub(1); target_y = game.ai_y[i].saturating_sub(1); },
                            5 => { target_x = (game.ai_x[i] + 1).min(9); target_y = (game.ai_y[i] + 1).min(9); },
                            _ => {}
                        }
                    }
                }
            }
            
            // Move towards target
            if game.ai_x[i] < target_x {
                game.ai_x[i] += 1;
            } else if game.ai_x[i] > target_x {
                game.ai_x[i] -= 1;
            } else if game.ai_y[i] < target_y {
                game.ai_y[i] += 1;
            } else if game.ai_y[i] > target_y {
                game.ai_y[i] -= 1;
            }
            
            // Check collision with player
            if game.ai_x[i] == game.player_x && game.ai_y[i] == game.player_y {
                if game.player_shield {
                    game.player_shield = false;
                    game.ai_alive[i] = false;
                    game.ai_killed += 1;
                    msg!("Shield blocked AI {}!", i);
                } else {
                    collision_detected = true;
                    msg!("Player killed by AI {}!", i);
                }
            }
        }
        
        if collision_detected {
            game.player_alive = false;
            game.combo_count = 0;
        } else {
            // Increase combo
            game.combo_count += 1;
            if game.combo_count >= 15 {
                game.combo_multiplier = 3;
            } else if game.combo_count >= 10 {
                game.combo_multiplier = 2;
            } else if game.combo_count >= 5 {
                game.combo_multiplier = 2;
            }
        }
        
        msg!("AI turn processed. Combo: {}", game.combo_count);
        Ok(())
    }
    
    pub fn advance_round(ctx: Context<AdvanceRound>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(!game.game_over, GameError::GameIsOver);
        
        let center_x = 5_i16;
        let center_y = 5_i16;
        
        // Check player zone
        let player_dist = ((game.player_x as i16 - center_x).abs() + 
                          (game.player_y as i16 - center_y).abs()) as u8;
        if player_dist > game.safe_zone_radius {
            game.player_alive = false;
            msg!("Player eliminated! Outside safe zone.");
        }
        
        // Check AI zones
        for i in 0..9 {
            if !game.ai_alive[i] { continue; }
            let ai_dist = ((game.ai_x[i] as i16 - center_x).abs() + 
                          (game.ai_y[i] as i16 - center_y).abs()) as u8;
            if ai_dist > game.safe_zone_radius {
                game.ai_alive[i] = false;
                game.ai_killed += 1;
                msg!("AI {} eliminated by zone!", i);
            }
        }
        
        // Advance round
        game.round += 1;
        
        // Shrink zone
        if game.round % 2 == 0 && game.safe_zone_radius > 1 {
            game.safe_zone_radius -= 1;
            msg!("Safe zone shrunk to radius {}", game.safe_zone_radius);
        }
        
        // Decrease freeze timer
        if game.player_freeze_rounds > 0 {
            game.player_freeze_rounds -= 1;
        }
        
        // Spawn powerup every 2 rounds
        if game.round % 2 == 0 && !game.powerup_active {
            let clock = Clock::get()?;
            let rand_x = ((clock.unix_timestamp as u64 % 8) + 1) as u8;
            let rand_y = (((clock.unix_timestamp as u64 / 10) % 8) + 1) as u8;
            let rand_type = ((clock.unix_timestamp as u64 % 5) + 1) as u8;
            
            game.powerup_x = rand_x;
            game.powerup_y = rand_y;
            game.powerup_type = rand_type;
            game.powerup_active = true;
            msg!("Powerup spawned at ({}, {}) type {}", rand_x, rand_y, rand_type);
        }
        
        // Check game over
        if game.round > 10 || !game.player_alive {
            game.game_over = true;
            msg!("Game over!");
        }
        
        msg!("Round {} / 10", game.round);
        Ok(())
    }
    
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(game.game_over, GameError::GameNotOver);
        require!(game.player_alive, GameError::PlayerDead);
        
        // Apply combo multiplier to prize
        let base_prize = game.prize_pool;
        let multiplied_prize = base_prize * game.combo_multiplier as u64;
        
        let rent = Rent::get()?.minimum_balance(game.to_account_info().data_len());
        let prize = game.to_account_info().lamports().checked_sub(rent).unwrap().min(multiplied_prize);
        
        **game.to_account_info().try_borrow_mut_lamports()? -= prize;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += prize;
        
        msg!("Prize claimed: {} lamports ({}x multiplier)", prize, game.combo_multiplier);
        Ok(())
    }
    
    pub fn reset_game(ctx: Context<ResetGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        let entry_fee = 50_000_000;
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: game.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, entry_fee)?;
        
        game.player = ctx.accounts.player.key();
        game.player_x = 5;
        game.player_y = 5;
        game.player_alive = true;
        game.round = 1;
        game.safe_zone_radius = 5;
        game.prize_pool = entry_fee;
        game.game_over = false;
        
        game.ai_x = [1, 9, 1, 9, 5, 1, 9, 5, 5];
        game.ai_y = [1, 1, 9, 9, 1, 5, 5, 9, 3];
        game.ai_alive = [true; 9];
        game.ai_personality = [0, 1, 2, 3, 0, 1, 2, 0, 3];
        
        game.powerup_x = 255;
        game.powerup_y = 255;
        game.powerup_type = 0;
        game.powerup_active = false;
        game.player_shield = false;
        game.player_speed_boost = 0;
        game.player_freeze_rounds = 0;
        game.combo_count = 0;
        game.combo_multiplier = 1;
        game.total_moves = 0;
        game.ai_killed = 0;
        game.powerups_collected = 0;
        
        msg!("Game reset!");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = player,
        space = 8 + Game::INIT_SPACE,
        seeds = [b"game", player.key().as_ref()],
        bump
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetGame<'info> {
    #[account(
        mut,
        seeds = [b"game", player.key().as_ref()],
        bump = game.bump
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MovePlayer<'info> {
    #[account(
        mut,
        seeds = [b"game", player.key().as_ref()],
        bump = game.bump,
        has_one = player
    )]
    pub game: Account<'info, Game>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct ProcessAITurn<'info> {
    #[account(
        mut,
        seeds = [b"game", player.key().as_ref()],
        bump = game.bump,
        has_one = player
    )]
    pub game: Account<'info, Game>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdvanceRound<'info> {
    #[account(
        mut,
        seeds = [b"game", player.key().as_ref()],
        bump = game.bump,
        has_one = player
    )]
    pub game: Account<'info, Game>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(
        mut,
        seeds = [b"game", player.key().as_ref()],
        bump = game.bump,
        has_one = player
    )]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub player: Pubkey,
    pub player_x: u8,
    pub player_y: u8,
    pub player_alive: bool,
    pub ai_x: [u8; 9],
    pub ai_y: [u8; 9],
    pub ai_alive: [bool; 9],
    pub ai_personality: [u8; 9],
    pub round: u8,
    pub safe_zone_radius: u8,
    pub prize_pool: u64,
    pub game_over: bool,
    pub bump: u8,
    // Power-up system
    pub powerup_x: u8,
    pub powerup_y: u8,
    pub powerup_type: u8,
    pub powerup_active: bool,
    // Player inventory
    pub player_shield: bool,
    pub player_speed_boost: u8,
    pub player_freeze_rounds: u8,
    // Combo system
    pub combo_count: u8,
    pub combo_multiplier: u8,
    // Stats
    pub total_moves: u16,
    pub ai_killed: u8,
    pub powerups_collected: u8,
}

#[error_code]
pub enum GameError {
    #[msg("Game is over")]
    GameIsOver,
    #[msg("Game is not over yet")]
    GameNotOver,
    #[msg("Player is dead")]
    PlayerDead,
    #[msg("Position out of bounds")]
    OutOfBounds,
    #[msg("Invalid move distance")]
    InvalidMove,
}