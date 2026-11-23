$b = "$HOME\.claude\skills\gstack\browse\dist\browse.exe"
& $b viewport 390x844
& $b goto http://localhost:3000
Start-Sleep -Milliseconds 1200

# Open Sheets Modal (Header button 2)
& $b js "const btns = document.querySelectorAll('header button'); if (btns[1]) btns[1].click();"
Start-Sleep -Milliseconds 800
& $b screenshot mobile-modal-sheets-audit.png

# Close modal
& $b press Escape
Start-Sleep -Milliseconds 500

# Open OCR / AI Studio Modal (Header button 0)
& $b js "const btns = document.querySelectorAll('header button'); if (btns[0]) btns[0].click();"
Start-Sleep -Milliseconds 800
& $b screenshot mobile-modal-ocr-audit.png

# Close modal
& $b press Escape
Start-Sleep -Milliseconds 500

# Go to Contacts tab and open Contact Review modal
& $b js "const nav = document.querySelector('nav'); if (nav) { const btns = nav.querySelectorAll('button'); if (btns[2]) btns[2].click(); }"
Start-Sleep -Milliseconds 1000

& $b js "const rev = document.querySelector('button[id^=\"mobile-review-btn-\"]'); if (rev) rev.click();"
Start-Sleep -Milliseconds 800
& $b screenshot mobile-modal-review-audit.png
