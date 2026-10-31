const page=new Page();await page.goto("data:text/html,<h1>Script CLI</h1>");return page.evaluate("document.querySelector('h1').textContent");
