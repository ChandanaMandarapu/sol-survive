use anchor_lang::prelude::*;

declare_id!("H9xrsmTET4Kfj51ULfZog5GKjrBanrknrSAByqeCw5w2");

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
        
        // Initialize 9 AI bots at fixed positions (corners and edges)
        game.ai_x = [1, 9, 1, 9, 5, 1, 9, 5, 5];
        game.ai_y = [1, 1, 9, 9, 1, 5, 5, 9, 3];
        game.ai_alive = [true; 9];
        game.ai_personality = [0, 1, 2, 3, 0, 1, 2, 0, 3]; // 0=Aggro, 1=Def, 2=Coward, 3=Chaos
        
        game.round = 1;
        game.safe_zone_radius = 5;
        game.prize_pool = transfer_amount;
        game.game_over = false;
        game.bump = ctx.bumps.game;
        
        msg!("Game initialized! Player at (5,5). 9 AI spawned.");
        Ok(())
    }
    
    pub fn move_player(ctx: Context<MovePlayer>, new_x: u8, new_y: u8) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(!game.game_over, GameError::GameIsOver);
        require!(game.player_alive, GameError::PlayerDead);
        
        require!(new_x < 10 && new_y < 10, GameError::OutOfBounds);
        
        let dx = (new_x as i16 - game.player_x as i16).abs();
        let dy = (new_y as i16 - game.player_y as i16).abs();
        require!(dx + dy <= 3 && dx + dy > 0, GameError::InvalidMove);
        
        game.player_x = new_x;
        game.player_y = new_y;
        
        msg!("Player moved to ({}, {})", new_x, new_y);
        Ok(())
    }
    
    pub fn process_ai_turn(ctx: Context<ProcessAITurn>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(!game.game_over, GameError::GameIsOver);
        
        // Move each alive AI
        for i in 0..9 {
            if !game.ai_alive[i] {
                continue;
            }
            
            let personality = game.ai_personality[i];
            let mut target_x = 5_u8;
            let mut target_y = 5_u8;
            
            // Personality affects target
            match personality {
                0 => { // aggressive - chase player
                    target_x = game.player_x;
                    target_y = game.player_y;
                },
                1 => { // defensive - stay center
                    target_x = 5;
                    target_y = 5;
                },
                2 => { // coward - run from player
                    let dx = game.ai_x[i] as i16 - game.player_x as i16;
                    let dy = game.ai_y[i] as i16 - game.player_y as i16;
                    target_x = (game.ai_x[i] as i16 + dx.signum()).clamp(0, 9) as u8;
                    target_y = (game.ai_y[i] as i16 + dy.signum()).clamp(0, 9) as u8;
                },
                _ => { // chaos - random direction
                    let clock = Clock::get()?;
                    let random = (clock.unix_timestamp as u64 + i as u64) % 4;
                    match random {
                        0 => target_y = game.ai_y[i].saturating_sub(1),
                        1 => target_y = (game.ai_y[i] + 1).min(9),
                        2 => target_x = game.ai_x[i].saturating_sub(1),
                        _ => target_x = (game.ai_x[i] + 1).min(9),
                    }
                }
            }
            
            // step towards target
            if game.ai_x[i] < target_x {
                game.ai_x[i] += 1;
            } else if game.ai_x[i] > target_x {
                game.ai_x[i] -= 1;
            } else if game.ai_y[i] < target_y {
                game.ai_y[i] += 1;
            } else if game.ai_y[i] > target_y {
                game.ai_y[i] -= 1;
            }
        }
        
        msg!("AI turn processed. All bots moved.");
        Ok(())
    }
    
    pub fn advance_round(ctx: Context<AdvanceRound>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(!game.game_over, GameError::GameIsOver);
        
        //chckng eliminations
        let center_x = 5_i16;
        let center_y = 5_i16;
        
        // check player bro
        let player_dist = ((game.player_x as i16 - center_x).abs() + (game.player_y as i16 - center_y).abs()) as u8;
        if player_dist > game.safe_zone_radius {
            game.player_alive = false;
            msg!("Player eliminated! Outside safe zone.");
        }
        
        // check AI
        for i in 0..9 {
            if !game.ai_alive[i] {
                continue;
            }
            let ai_dist = ((game.ai_x[i] as i16 - center_x).abs() + (game.ai_y[i] as i16 - center_y).abs()) as u8;
            if ai_dist > game.safe_zone_radius {
                game.ai_alive[i] = false;
                msg!("AI {} eliminated!", i);
            }
        }
        
        // advance round  shrink zone
        game.round += 1;
        if game.round % 2 == 0 && game.safe_zone_radius > 1 {
            game.safe_zone_radius -= 1;
            msg!("Safe zone shrunk to radius {}", game.safe_zone_radius);
        }
        
        // check game over
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
        
        // transfer prize to winner
        let rent = Rent::get()?.minimum_balance(game.to_account_info().data_len());
        let prize = game.to_account_info().lamports().checked_sub(rent).unwrap();
        
        **game.to_account_info().try_borrow_mut_lamports()? -= prize;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += prize;
        
        msg!("Prize claimed: {} lamports", prize);
        Ok(())
    }
    
    pub fn reset_game(ctx: Context<ResetGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        // Transfer 0.05 SOL from player to game PDA (Entry Fee)
        let entry_fee = 50000000; // 0.05 SOL
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
        game.prize_pool += entry_fee; // Add to existing pool or reset? Let's add (pot grows?) or just reset. 
        // Actually for simplicity, let's just treat it as a new game
        game.prize_pool = entry_fee; 
        game.game_over = false;

        // Initialize AI positions - Fixed spawning for fairness
        // 0:Aggro 1:Defensive 2:Coward 3:Chaos
        game.ai_x = [1, 9, 1, 9, 5, 0, 9, 5, 4];
        game.ai_y = [1, 1, 9, 9, 1, 5, 5, 9, 4];
        game.ai_alive = [true; 9];
        game.ai_personality = [0, 1, 2, 3, 0, 1, 2, 0, 3];

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init, 
        payer = player, 
        space = 8 + 32 + 2 + 2 + 1 + 9 + 9 + 9 + 9 + 1 + 1 + 8 + 1 + 1,
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
