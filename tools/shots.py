import json
from playwright.sync_api import sync_playwright

shots = json.load(open('/home/hatch/workspace/makefun/best-game-01-entry/shots.json'))
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width':1280,'height':720})
    errors = []
    pg.on('console', lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errors.append(f"pageerror: {e}"))
    for s in shots:
        pg.goto(f"http://localhost:8080/{s['query']}")
        try:
            pg.wait_for_function("window.__shotReady === true", timeout=15000)
        except Exception as e:
            print("TIMEOUT", s['name'], e)
        pg.screenshot(path=f"/home/hatch/workspace/makefun/best-game-01-entry/screenshots/{s['name']}", quality=88, type='jpeg')
        print("shot", s['name'], "done")
    pg.goto("http://localhost:8080/")
    pg.wait_for_timeout(800)
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    pg.mouse.move(900, 300)
    pg.mouse.down()
    pg.keyboard.down("KeyD")
    pg.wait_for_timeout(3000)
    pg.keyboard.up("KeyD")
    pg.keyboard.down("KeyW")
    pg.wait_for_timeout(2000)
    pg.keyboard.up("KeyW")
    pg.mouse.up()
    print("LIVE:", pg.evaluate("() => document.getElementById('status').textContent"))
    print("ERRORS:", errors[:10] if errors else "none")
    b.close()
