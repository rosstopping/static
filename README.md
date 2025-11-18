# ⚡️ Static - The Pure Power of Simplicity.

<p><img src="https://raw.githubusercontent.com/thedevdojo/static/main/art/github-static-cover.png" alt="github cover" /></p>

A static site generator you're going to love. No more complicated configs, bloated frameworks, or feeling like you got kicked in the face by a horse! Here's the spiel:

- Static is **easy**. 
- HTML is **easy**. 
- Yet, somehow we lost the art of **crafting simple** Static HTML websites

No longer will this stand! <a href="https://static.devdojo.com" target="_blank"><strong>Static</strong></a> is here to reclaim the throne of simplicity!

## 🆕 New Features in This Fork

This fork adds several powerful enhancements to the original Static generator:

### Global Data Files
Access global markdown files from anywhere in your site using the `{global.filename}` syntax. Place files in `content/global/` and reference them throughout your templates.

```html
<!-- Access entire content -->
{global.settings}

<!-- Access specific frontmatter attributes -->
{global.settings.siteName}
{global.settings.email}
```

Example `content/global/settings.md`:
```markdown
---
siteName: My Awesome Site
email: contact@example.com
---

Global content goes here.
```

### Root Attribute for Collections
Navigate nested JSON structures in collections using the `root` attribute. This allows you to iterate over arrays that are nested within your JSON files.

```html
<ForEach collection="menu" root="items" as="item">
    <h2>{item.title}</h2>
</ForEach>
```

```json
{
	"items": [
		{
			"title": "Home",
		},
		{
			"title": "About",
		}
	]
}
```

### Frontmatter Array Iteration
Loop through array data directly from your markdown frontmatter using the `frontmatter.` prefix in collections.

```markdown
---
team:
  - name: Alice
    role: Developer
  - name: Bob
    role: Designer
---
```

```html
<ForEach collection="frontmatter.team" as="member">
    <p>{member.name} - {member.role}</p>
</ForEach>
```

### Dynamic Include Attributes
Pass template variables into include attributes, allowing dynamic content to be injected into reusable components. Supports both frontmatter and global data.

```html
<!-- Use frontmatter data in includes -->
<include src="author-card.html" name="{frontmatter.author}" role="{frontmatter.role}"></include>

<!-- Use global data in includes -->
<include src="header.html" siteName="{global.settings.siteName}"></include>

<!-- Mix both -->
<include src="contact.html" name="{frontmatter.name}" email="{global.contact.email}"></include>
```

In your `includes/author-card.html`:
```html
<div class="author">
    <h3>{name}</h3>
    <p>{role}</p>
</div>
```

### Include Slot Content
Pass content between include tags using the `{slot}` placeholder, similar to how layouts work. This makes includes work like reusable components with customizable content.

```html
<!-- Use a card wrapper with custom content -->
<include src="card.html" title="Featured Article">
    <p>This content goes inside the card's slot.</p>
    <a href="/read-more">Read More</a>
</include>
```

In your `includes/card.html`:
```html
<div class="card">
    <h3 class="card-title">{title}</h3>
    <div class="card-body">
        {slot}
    </div>
</div>
```

Result:
```html
<div class="card">
    <h3 class="card-title">Featured Article</h3>
    <div class="card-body">
        <p>This content goes inside the card's slot.</p>
        <a href="/read-more">Read More</a>
    </div>
</div>
```

**Note:** Self-closing includes (`<include src="..." />`) will have an empty slot.

### Flexible Tag Formatting
All custom tags support flexible whitespace and line breaks, making your code more readable. Tags can be written on multiple lines with spaces around attributes, and include tags support both self-closing and regular syntax.

```html
<!-- Multi-line layout -->
<layout 
    title="My Page"
    src="main.html"
>
    Content here
</layout>

<!-- Self-closing include -->
<include src="header.html" />

<!-- Multi-line self-closing include -->
<include 
    src="card.html" 
    title="{frontmatter.title}"
    author="{frontmatter.author}"
/>

<!-- Regular closing include (also supported) -->
<include src="footer.html"></include>

<!-- Multi-line ForEach -->
<ForEach 
    collection="posts" 
    orderBy="date, desc"
    count="5"
>
    <article>{posts.title}</article>
</ForEach>

<!-- Multi-line If condition -->
<If 
    condition="frontmatter.published === true"
>
    Published content
</If>
```

## 🛠️ Setup in a Snap

Make sure you have Node installed on your machine, and then copy/paste the following command in your terminal:

```
npm install -g @rosstopping/static
```

Now you'll have the **static** command available on your machine, allowing you to run the following:

- **static new folder-name** - Create a new website with the static starter template
- **static dev** - Start up a dev environment of your static website
- **static build** - Build a production ready version of your website (available in the `_site` directory)

Next, head on over to [the official documentation](https://static.devdojo.com/docs) to learn more about building your site.

## 🖐️ Five reasons this might just be your jam!

### 1. Page-based Routing

Each file within the `pages` directory corresponds to a route on your website. With a structure like this:

```
pages
├── index.html
├── about.html
├── contact
│   ├── index.html
│   ├── form
│   │   ├── index.html
```

Your new site will have the following routes available:

```
http://localhost:3000
http://localhost:3000/about
http://localhost:3000/contact
http://localhost:3000/contact/form
```

### 2. Layouts

Design **layouts** that multiple pages can utilize.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body>
    {slot}
</body>
</html>
```

Then, use it in any page.

```
<layout title="Radical Righteousness" src="main.html">

    <h1>🏄‍♂️ Totally Tubuloso Website</h1>
    
</layout>
```
### 3. Includes

Create re-usable HTML partials with the `<include>` tag. Specify the HTML file with the `src` attribute.

```
<layout title="Behind the Scenes!" src="main.html">

    <include src="about-header.html"></include>
    <include src="about-copy.html"></include>

</layout>
```

### 4. TailwindCSS Integration

Add the TailwindCSS **shortcode** to the `<head>` of any layout and it will automatically be injected. Example:

```
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    {tailwindcss}
</head>
<body>
    {slot}
</body>
</html>
```

It will be replaced with the Tailwind CDN link in `dev`, and a minified CSS file will be compiled during `build`.

### 5. Collections

Add collections of data to your application. Here's an example collection located at **collections/menu.json**

```
[
    {
        "title" : "Home",
        "link" : "/"
    },
    {
        "title" : "About",
        "link" : "/about"
    }
]
```

Now, you can easily loop through this collection:

```
<ForEach collection="menu">
    <li>{menu.title}</h1>
</ForEach>
```

> Those are just a few of the hot features available, but there's [so much more to uncover and learn](https://static.devdojo.com/docs).

# Learn More

You can learn about all the features available in Static by visiting the [official documentation](https://static.devdojo.com/docs). You may also be interested in checking out some of the [templates here](https://static.devdojo.com/templates).

Static HTML is King 👑
