$b = "$HOME\.claude\skills\gstack\browse\dist\browse.exe"
& $b viewport 390x844
& $b goto http://localhost:3000
Start-Sleep -Milliseconds 2000

# 1. Scanner View
& $b screenshot mobile-v3-scanner.png

# 2. Contacts View
& $b js "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Contacts') && b.offsetParent !== null)[0]?.click()"
Start-Sleep -Milliseconds 1200
& $b screenshot mobile-v3-contacts.png

# 3. Contact Review Modal
& $b js "document.querySelectorAll('button[id^=\`mobile-review-btn-\`]')[0]?.click()"
Start-Sleep -Milliseconds 1200
& $b screenshot mobile-v3-review-modal.png

# Close modal
& $b press Escape
Start-Sleep -Milliseconds 800

# 4. Dashboard View
& $b js "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Dashboard') && b.offsetParent !== null)[0]?.click()"
Start-Sleep -Milliseconds 1200
& $b screenshot mobile-v3-dashboard.png

# 5. Export View
& $b js "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Export') && b.offsetParent !== null)[0]?.click()"
Start-Sleep -Milliseconds 1200
& $b screenshot mobile-v3-export.png
