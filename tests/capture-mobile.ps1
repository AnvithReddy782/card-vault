$b = "$HOME\.claude\skills\gstack\browse\dist\browse.exe"
& $b viewport 390x844
& $b goto http://localhost:3000
Start-Sleep -Milliseconds 1200
& $b screenshot mobile-screen-1-scanner.png

# Click Contacts in bottom nav
& $b js "const nav = document.querySelector('nav'); if (nav) { const btns = nav.querySelectorAll('button'); if (btns[2]) btns[2].click(); }"
Start-Sleep -Milliseconds 1000
& $b screenshot mobile-screen-2-contacts.png

# Click Dashboard
& $b js "const nav = document.querySelector('nav'); if (nav) { const btns = nav.querySelectorAll('button'); if (btns[0]) btns[0].click(); }"
Start-Sleep -Milliseconds 1000
& $b screenshot mobile-screen-3-dashboard.png

# Click Export
& $b js "const nav = document.querySelector('nav'); if (nav) { const btns = nav.querySelectorAll('button'); if (btns[3]) btns[3].click(); }"
Start-Sleep -Milliseconds 1000
& $b screenshot mobile-screen-4-export.png
