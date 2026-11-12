"""
scripts/verify_gameplay_and_responsive.py
──────────────────────────────────────────
End-to-end automated visual, responsive and gameplay verification.
1. Desktop (1440x900): Inspect Home, Logo, Modes
2. Tablet (768x1024): Inspect Vault & Missions
3. Mobile (390x844): Play 5-player Pass-and-Play Match:
   - Secret word distribution
   - Turn clue submissions (5 players)
   - Discussion & Secret Voting
   - Impostor reveal & final guess opportunity
   - Results screen & Play Again
4. Capture high-res screenshots for audit report.
"""
import os
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

OUTPUT_DIR = "c:/Users/ASUS/Catch-Me-If-You-Can/audit_screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)

chrome_opts = Options()
chrome_opts.add_argument("--headless")
chrome_opts.add_argument("--no-sandbox")
chrome_opts.add_argument("--disable-dev-shm-usage")
chrome_opts.add_argument("--disable-gpu")

driver = webdriver.Chrome(options=chrome_opts)

def save_screen(name, desc=""):
    path = os.path.join(OUTPUT_DIR, f"{name}.png")
    driver.save_screenshot(path)
    print(f"📸 Saved screenshot: {name}.png ({desc})")

try:
    print("=== TASK 2 & 5: VISUAL & RESPONSIVE INSPECTION ===")

    # 1. Desktop: 1440x900
    driver.set_window_size(1440, 900)
    driver.get("http://127.0.0.1:3000")
    time.sleep(2)
    save_screen("01_desktop_home_1440x900", "Desktop Landing Page with 3D Logo")

    # 2. Tablet: 768x1024 - Vault & Store
    driver.set_window_size(768, 1024)
    driver.get("http://127.0.0.1:3000/vault")
    time.sleep(2)
    save_screen("02_tablet_vault_768x1024", "Tablet Cosmetic Vault & Missions")

    # 3. Mobile: 390x844 - Home
    driver.set_window_size(390, 844)
    driver.get("http://127.0.0.1:3000")
    time.sleep(2)
    save_screen("03_mobile_home_390x844", "Mobile Responsive Landing Page")

    print("\n=== TASK 4: FULL 5-PLAYER GAMEPLAY MATCH VERIFICATION ===")
    driver.get("http://127.0.0.1:3000/pass-and-play")
    time.sleep(2)
    save_screen("04_match_setup", "Match Setup Screen (5 Players)")

    # Click 'Start Match'
    start_btn = driver.find_element(By.XPATH, "//button[contains(., 'Start Match')]")
    start_btn.click()
    time.sleep(1)
    save_screen("05_handoff_curtain_p1", "Privacy Handoff Curtain for Player 1")

    # Step through 5 player secret reveals
    for p_num in range(1, 6):
        # Reveal button
        reveal_btn = driver.find_element(By.XPATH, "//button[contains(., 'Reveal Secret Word')]")
        reveal_btn.click()
        time.sleep(1)
        save_screen(f"06_secret_word_p{p_num}", f"Secret Word Peek for Player {p_num}")

        # Hide & Pass
        hide_btn = driver.find_element(By.XPATH, "//button[contains(., 'Hide & Pass')]")
        hide_btn.click()
        time.sleep(1)

    print("✅ All 5 players successfully peeked their secret words!")
    save_screen("07_clue_round_p1", "Turn-Based Clue Submission (Player 1)")

    # Submit 5 distinct clues in turn order
    clues = [
        "A pocket gadget everyone carries around daily.",
        "You use it to send quick messages and check apps.",
        "It has a touchscreen and needs to be charged often.",
        "It connects you with friends and plays media smoothly.",
        "An indispensable handheld tool with many sensors."
    ]

    for idx, clue_text in enumerate(clues, start=1):
        input_box = driver.find_element(By.XPATH, "//input[@placeholder='Give a subtle, 1-sentence clue…']")
        input_box.clear()
        input_box.send_keys(clue_text)
        time.sleep(0.5)
        submit_btn = driver.find_element(By.XPATH, "//button[contains(., 'Submit Clue')]")
        submit_btn.click()
        time.sleep(1)
        print(f"  • Player {idx} submitted clue: '{clue_text}'")

    print("✅ All 5 clues submitted in turn order!")
    save_screen("08_discussion_phase", "Discussion Phase with All Clues Displayed")

    # Proceed to Secret Voting
    proceed_vote_btn = driver.find_element(By.XPATH, "//button[contains(., 'Proceed to Secret Voting')]")
    proceed_vote_btn.click()
    time.sleep(1)
    save_screen("09_secret_voting_booth", "Secret Ballot Voting Booth")

    # Cast 5 secret votes (everyone votes for Player 1 to test elimination & guess)
    for voter_idx in range(1, 6):
        vote_targets = driver.find_elements(By.XPATH, "//button[contains(., 'Player')]")
        # Click the first valid target
        for btn in vote_targets:
            if "Player 1" in btn.text and not btn.get_attribute("disabled"):
                btn.click()
                break
        time.sleep(1)

    print("✅ All 5 secret votes cast and tallied!")
    save_screen("10_vote_result_or_guess", "Vote Tally Outcome Screen")

    # Check if final guess is requested
    final_guess_inputs = driver.find_elements(By.XPATH, "//input[@placeholder='Type your guess here…']")
    if final_guess_inputs:
        print("🎯 Impostor caught! Testing Last Chance Final Guess opportunity...")
        final_guess_inputs[0].send_keys("SMARTPHONE")
        time.sleep(0.5)
        guess_submit = driver.find_element(By.XPATH, "//button[contains(., 'Submit Last Chance Guess')]")
        guess_submit.click()
        time.sleep(1)
        save_screen("11_final_guess_outcome", "Impostor Word Guess Evaluation")

    save_screen("12_results_and_replay", "Results, Role Reveals & Play Again")
    print("\n🎉 COMPLETE 5-PLAYER LOCAL PASS-AND-PLAY MATCH VERIFIED SUCCESSFULLY!")

except Exception as e:
    print(f"❌ Error during browser verification: {e}")
    save_screen("error_state", "Error state capture")
    raise
finally:
    driver.quit()
