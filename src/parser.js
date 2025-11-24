const fs = require('fs');
const path = require('path');
const currentDirectory = process.cwd();
let showdown = require('showdown');
let toc = require('markdown-toc');
let fm = require('front-matter');
let isContentFile = false;
let env = require('./env.js');

module.exports = {
    processFile(filePath, build = false, url = 'relative', frontmatterData = null) {


        let page = this.getPage(filePath);

        const layoutTagExists = /<layout[\s\S]*?>[\s\S]*?<\/layout>/i.test(page);

        if (layoutTagExists) {
            layoutAttributes = this.getLayoutAttributes(page);

            if (typeof layoutAttributes.src == 'undefined') {
                throw new Error('Layout Tag must include a src');
            }

            let layoutPath = path.join(currentDirectory, '/layouts/', layoutAttributes.src);
            let layout = fs.readFileSync(layoutPath, 'utf8');

            // parse any includes that are inside the layout template
            layout = this.parseIncludeContent(layout, frontmatterData);

            // replace {slot} with content inside of Layout
            layout = layout.replace('{slot}', this.parseIncludeContent(this.getPageContent(page), frontmatterData));

            page = this.processCollectionLoops(this.processContentLoops(this.parseShortCodes(this.replaceAttributesInLayout(layout, layoutAttributes), url, build), filePath), filePath, frontmatterData);

            page = this.processGlobalData(this.processCollectionJSON(this.processDumpTags(page)));
        }

        return page;
    },

    processContent(contentPath, build = false, url = 'relative') {

        let content = fs.readFileSync(contentPath, 'utf8');

        // Extract frontmatter early so it can be passed to processFile
        let contentAttributes = fm(content).attributes;

        let pagePath = this.getPageForContent(contentPath);
        let page = this.processFile(pagePath, build, url, contentAttributes);

        showdown.setOption('ghCompatibleHeaderId', true);
        showdown.setOption('tables', true);
        converter = new showdown.Converter();

        let tableOfContents = toc(content);
        let updatedContent = content.replace('[toc]', tableOfContents.content);

        let contentHTML = converter.makeHtml(this.removeFrontMatter(updatedContent));
        // contentAttributes already extracted earlier

        let staticJS = "window.toc = JSON.parse('" + JSON.stringify(tableOfContents.json).replace(/'/g, "\\'") + "'); window.frontmatter=JSON.parse('" + JSON.stringify(contentAttributes).replace(/'/g, "\\'") + "');";
        let attrTags = "<script>" + staticJS + "</script>";

        // process frontmatter conditions
        page = this.processFrontMatterConditions(page, contentAttributes);
        page = this.processFrontMatterReplacements(page, contentAttributes);



        if (page.includes('{static_content_element}')) {
            let staticContentElement = "<div id='static-content' style='display:none;' data-toc='" + JSON.stringify(tableOfContents.json).replace(/'/g, "\\'") + "' data-frontmatter='" + JSON.stringify(contentAttributes).replace(/'/g, "\\'") + "'></div>";
            page = page.replace('{static_content_element}', staticContentElement);
        }

        page = page.replace('</head>', attrTags + '\n</head>');
        page = page.replace('{content}', contentHTML);

        // this will add the ability to include src partials in your markdown
        page = this.parseIncludeContent(page, contentAttributes);

        return page;

    },

    processFrontMatterReplacements(content, data) {
        const placeholderRegex = /{frontmatter\.([^}|\s]+)(?:\s+or\s+([^}]+))?}/g;

        return content.replace(placeholderRegex, (match, key, fallback) => {
            if (data.hasOwnProperty(key)) {
                return data[key];
            }
            if (fallback !== undefined) {
                // Handle 'null' keyword
                if (fallback.trim() === 'null') {
                    return '';
                }
                // Handle quoted strings
                const quotedMatch = fallback.trim().match(/^['"](.*)['"]$/);
                if (quotedMatch) {
                    return quotedMatch[1];
                }
                return fallback.trim();
            }
            return match; // If the key doesn't exist and no fallback, don't replace.
        });
    },

    processFrontMatterConditions(content, data) {
        const conditionRegex = /<If[\s\S]+?condition\s*=\s*"([^"]+)"[\s\S]*?>([\s\S]*?)<\/If>/gi;

        return content.replace(conditionRegex, (match, condition, body) => {
            // Evaluate the condition using the frontmatter data
            const evalContext = { frontmatter: data };
            let meetsCondition = false;

            try {
                const evalFunction = new Function('data', `with(data) { return ${condition}; }`);
                meetsCondition = evalFunction(evalContext);
            } catch (err) {
                console.warn(`Failed to evaluate condition: ${condition}`, err);
            }

            return meetsCondition ? body : '';
        });
    },

    processDumpTags(body) {
        const dumpRegex = /{dump\(['"]([^'"]+)['"]\)}/g;
        let match;

        while ((match = dumpRegex.exec(body)) !== null) {
            const filePath = match[1];
            const fullPath = path.join(currentDirectory, filePath);

            if (!fs.existsSync(fullPath)) {
                console.warn(`Dump file not found: ${fullPath}`);
                body = body.replace(match[0], '');
                continue;
            }

            try {
                const fileContent = fs.readFileSync(fullPath, 'utf8');
                // Escape the content for safe HTML insertion
                const escapedContent = fileContent
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
                body = body.replace(match[0], escapedContent);
            } catch (err) {
                console.warn(`Failed to read dump file: ${fullPath}`, err);
                body = body.replace(match[0], '');
            }
        }

        return body;
    },

    processCollectionJSON(body) {
        const collectionRegex = /{collections\.([^}]+)\.json}/g;
        let match;
        while ((match = collectionRegex.exec(body)) !== null) {
            const collectionName = match[1];
            const collectionData = JSON.parse(fs.readFileSync(path.join(currentDirectory, `/collections/${collectionName}.json`), 'utf8'));
            const collectionDataString = JSON.stringify(collectionData);
            body = body.replace(match[0], collectionDataString);
        }
        return body;
    },

    processGlobalData(body) {
        const globalRegex = /{global\.([^.}|\s]+)(?:\.([^}|\s]+))?(?:\s+or\s+([^}]+))?}/g;
        let match;

        while ((match = globalRegex.exec(body)) !== null) {
            const fileName = match[1];
            const attribute = match[2];
            const fallback = match[3];
            const globalFilePath = path.join(currentDirectory, `/content/global/${fileName}.md`);

            if (!fs.existsSync(globalFilePath)) {
                console.warn(`Global file not found: ${globalFilePath}`);
                if (fallback !== undefined) {
                    let fallbackValue = '';
                    if (fallback.trim() === 'null') {
                        fallbackValue = '';
                    } else {
                        const quotedMatch = fallback.trim().match(/^['"](.*)['"]$/);
                        fallbackValue = quotedMatch ? quotedMatch[1] : fallback.trim();
                    }
                    body = body.replace(match[0], fallbackValue);
                }
                continue;
            }

            const fileContent = fs.readFileSync(globalFilePath, 'utf8');
            const parsedContent = fm(fileContent);

            let replacement = '';
            if (attribute) {
                // Access specific frontmatter attribute
                replacement = parsedContent.attributes[attribute];
                if (!replacement && fallback !== undefined) {
                    if (fallback.trim() === 'null') {
                        replacement = '';
                    } else {
                        const quotedMatch = fallback.trim().match(/^['"](.*)['"]$/);
                        replacement = quotedMatch ? quotedMatch[1] : fallback.trim();
                    }
                } else if (!replacement) {
                    replacement = '';
                }
                // If replacement is an object or array, convert to JSON
                if (typeof replacement === 'object' && replacement !== null) {
                    replacement = JSON.stringify(replacement);
                }
            } else {
                // Return the entire content without frontmatter
                replacement = this.removeFrontMatter(fileContent);
            }

            body = body.replace(match[0], replacement);
        }

        return body;
    },

    // Parse down the directory tree until we find a `.html` file for this content
    getPageForContent(markdownFilePath) {
        const markdownDir = path.dirname(markdownFilePath);
        const markdownFileName = path.basename(markdownFilePath, '.md');
        const htmlFilePath = path.join(markdownDir, `${markdownFileName}.html`);
        const pageHTMLFilePath = htmlFilePath.replace(path.join(currentDirectory, '/content'), path.join(currentDirectory, '/pages'));

        if (fs.existsSync(pageHTMLFilePath)) {
            return pageHTMLFilePath;
        }

        let currentDir = markdownDir.replace(path.join(currentDirectory, '/content'), path.join(currentDirectory, '/pages'));
        let htmlFileName = `${markdownFileName}.html`;
        let inc = 0;
        while (currentDir !== '' && inc < 10) {
            const parentDir = path.dirname(currentDir);
            htmlFileName = path.basename(currentDir) + '.html';
            const parentHtmlFilePath = path.join(parentDir, htmlFileName);
            const indexContentHtmlFilePath = path.join(currentDir, '[content].html');
            const indexHtmlFilePath = path.join(currentDir, 'index.html');

            if (fs.existsSync(indexContentHtmlFilePath)) {
                return indexContentHtmlFilePath;
            }

            if (fs.existsSync(indexHtmlFilePath)) {
                return indexHtmlFilePath;
            }

            if (fs.existsSync(parentHtmlFilePath)) {
                return parentHtmlFilePath;
            }

            inc++;
            currentDir = parentDir;
        }

        return null;
    },
    getPage(filePath) {
        page = fs.readFileSync(filePath, 'utf8');

        const pageTagRegex = /<page[\s\S]+?src\s*=\s*"([^"]+)"[\s\S]*?>([\s\S]*?)<\/page>/i;
        const match = page.match(pageTagRegex);

        if (match) {
            const src = match[1];
            const filePath = path.join(currentDirectory, './pages/', src);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            page = fileContent;
        }

        return page;
    },
    removeFrontMatter(markdownContent) {
        const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
        const match = markdownContent.match(frontMatterRegex);

        if (match) {
            const frontMatter = match[0];
            const content = markdownContent.replace(frontMatter, '');
            return content.trim();
        }

        return markdownContent.trim();
    },
    parseURLs(html, URL) {
        const regex = /{ url\('([^']+)'\) }/g;
        return html.replace(regex, (match, url) => {
            if (URL === 'relative') {
                return url;
            } else {
                return URL.replace(/\/$/, '') + url;
            }
        });
    },

    getLayoutAttributes(page) {
        const layoutTagRegex = /<layout[\s\S]+?>([\s\S]*?)<\/layout>/i;
        const layoutTagMatch = page.match(layoutTagRegex);

        if (layoutTagMatch) {
            const attributesString = layoutTagMatch[0].match(/<layout[\s\S]+?>/i)[0];
            const attributesRegex = /(\w+)\s*=\s*"([^"]*)"/g;
            let attributeMatch;
            let attributes = {};

            while ((attributeMatch = attributesRegex.exec(attributesString)) !== null) {
                attributes[attributeMatch[1]] = attributeMatch[2];
            }

            return attributes;
        }

        return null;
    },

    getIncludeAttributes(page) {
        const includeTagRegex = /<include[\s\S]+?(?:\/>|>[\s\S]*?<\/include>)/i;
        const includeTagMatch = page.match(includeTagRegex);

        if (includeTagMatch) {
            const attributesString = includeTagMatch[0].match(/<include[\s\S]+?(?:\/?>)/i)[0];
            const attributesRegex = /(\w+)\s*=\s*"([^"]*)"/g;
            let attributeMatch;
            let attributes = {};

            while ((attributeMatch = attributesRegex.exec(attributesString)) !== null) {
                attributes[attributeMatch[1]] = attributeMatch[2];
            }

            return attributes;
        }

        return null;
    },

    replaceAttributesInLayout(layout, layoutAttributes) {
        for (let key in layoutAttributes) {
            let regex = new RegExp(`{${key}(?:\\s+or\\s+[^}]+)?}`, 'g');
            layout = layout.replace(regex, layoutAttributes[key]);
        }
        // Handle any remaining placeholders with fallback syntax
        const fallbackRegex = /{([^}.|]+)(?:\s+or\s+([^}]+))?}/g;
        layout = layout.replace(fallbackRegex, (match, key, fallback) => {
            // If it's a known system variable or contains dots, leave it
            if (match.includes('.') || key === 'slot' || key === 'content') {
                return match;
            }
            // Apply fallback if provided
            if (fallback !== undefined) {
                if (fallback.trim() === 'null') {
                    return '';
                }
                const quotedMatch = fallback.trim().match(/^['"](.*)['"]$/);
                return quotedMatch ? quotedMatch[1] : fallback.trim();
            }
            return match;
        });
        return layout;
    },

    getPageContent(page) {
        const layoutTagRegex = /<layout[\s\S]+?>([\s\S]*?)<\/layout>/i;
        const layoutTagMatch = page.match(layoutTagRegex);

        if (layoutTagMatch) {
            return layoutTagMatch[1];
        }

        return null;
    },

    parseIncludeContent(htmlString, frontmatterData = null) {

        // while ((includeTag = includeRegex.exec(htmlString)) !== null) {
        //     const includeSrcPath = path.join(currentDirectory, '/includes/', includeTag[1]);
        //     const includeContent = fs.readFileSync(includeSrcPath, 'utf8');

        //     // Loop through the attributes of the include tag
        //     const attributeRegex = /(\w+)="([^"]+)"/g;
        //     let attributeMatch;
        //     while ((attributeMatch = attributeRegex.exec(includeTag[0])) !== null) {
        //         const attributeName = attributeMatch[1];
        //         const attributeValue = attributeMatch[2];

        //         // Replace attribute placeholders with attribute values in the include content
        //         const attributePlaceholderRegex = new RegExp(`{${attributeName}}`, 'g');
        //         includeContent = includeContent.replace(attributePlaceholderRegex, attributeValue);
        //     }

        //     htmlString = htmlString.replace(includeTag[0], includeContent);
        // }
        // return htmlString;



        let includeTag;
        const includeRegex = /<include[\s\S]+?src\s*=\s*"([^"]+)"[\s\S]*?(?:\/>|>([\s\S]*?)<\/include>)/gi;


        while ((includeTag = includeRegex.exec(htmlString)) !== null) {

            const includeSrcPath = path.join(currentDirectory, '/includes/', includeTag[1]);
            const slotContent = includeTag[2] || ''; // Capture content between tags (group 2)

            let includeContent = fs.readFileSync(includeSrcPath, 'utf8');

            const includeAttributes = this.getIncludeAttributes(includeTag[0]);
            for (const [attribute, value] of Object.entries(includeAttributes)) {
                let processedValue = value;

                // Process template variables in attribute values (e.g., {frontmatter.name})
                if (frontmatterData) {
                    processedValue = this.processFrontMatterReplacements(value, frontmatterData);
                }

                // Process global data in attribute values (e.g., {global.settings.title})
                processedValue = this.processGlobalData(processedValue);

                const regex = new RegExp(`{${attribute}(?:\\s+or\\s+[^}]+)?}`, 'g');
                includeContent = includeContent.replace(regex, processedValue);
            }

            // Replace {slot} with the content between the include tags
            includeContent = includeContent.replace(/{slot}/g, slotContent);

            // Handle any remaining placeholders with fallback syntax in includes
            const fallbackRegex = /{([^}.|\s(]+)(?:\s+or\s+([^}]+))?}/g;
            includeContent = includeContent.replace(fallbackRegex, (match, key, fallback) => {
                // Skip system keywords and special patterns
                if (key === 'slot' || key === 'tailwindcss' || key === 'content' || key === 'static_content_element') {
                    return match;
                }
                // If there's a fallback, apply it
                if (fallback !== undefined) {
                    if (fallback.trim() === 'null') {
                        return '';
                    }
                    const quotedMatch = fallback.trim().match(/^['"](.*)['"]$/);
                    return quotedMatch ? quotedMatch[1] : fallback.trim();
                }
                // If no fallback and variable wasn't replaced, leave it as is
                return match;
            });

            htmlString = htmlString.replace(includeTag[0], includeContent);
        }
        return htmlString;
    },

    parseShortCodes(content, url, build = false) {
        // {tailwindcss} shortcode
        let assetURL = url.replace(/\/$/, '');
        if (url == 'relative') {
            assetURL = '';
        }
        let tailwindReplacement = build ? '<link href="' + assetURL + '/assets/css/main.css" rel="stylesheet">' : '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4?plugins=forms,typography,aspect-ratio,line-clamp"></script>';
        if (!build) {
            // let moduleExportsContent = this.getModuleExportsContent();

            // // the inline config does not need the plugins array
            // const regex = /plugins:\s*\[[^\]]*\]/g;
            // moduleExportsContent = moduleExportsContent.replace(regex, 'plugins: []');
            // moduleExportsContent = moduleExportsContent.replace('plugins: [],', '');
            // moduleExportsContent = moduleExportsContent.replace('plugins: []', '');

            // tailwindReplacement += '<script>tailwind.config = ' + moduleExportsContent.replace(/;*$/, '') + '</script>';

            // If it is not build we also want to grab the contents inside the main.css file and add it to the head
            let cssContent = fs.readFileSync(currentDirectory + '/assets/css/main.css', 'utf8');
            // We also want to replace the tailwindcss @tailwind commands:
            cssContent = cssContent.replace('@tailwind base;', '').replace('@tailwind components;', '').replace('@tailwind utilities;', '');
            tailwindReplacement += `<style>${cssContent}</style>`;
        }
        content = content.replace('{tailwindcss}', tailwindReplacement);

        return content;
    },
    getModuleExportsContent() {
        const filePath = './tailwind.config.js';
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const startIndex = fileContent.indexOf('module.exports =') + 'module.exports ='.length;
        const moduleExportsContent = fileContent.substring(startIndex).trim();
        return moduleExportsContent;
    },

    processContentLoops(body, filePath) {
        const forEachContentTags = this.forEachContentTags(body);
        for (i = 0; i < forEachContentTags.length; i++) {
            const attributesAndValues = this.forEachAttributesAndValues(forEachContentTags[i]);
            const contentCollection = this.frontmatterLoops(currentDirectory + '/content/' + attributesAndValues.content);
            this.storeContentCollection(attributesAndValues.content, contentCollection);
        }
        return this.replaceForEachContentWithCollection(body);
    },

    replaceForEachContentWithCollection(body) {
        const regex = /<ForEach[\s\S]+?>/gi;
        const updatedBody = body.replace(regex, (match, attributes) => {
            const updatedAttributes = match.replace(/content\s*=\s*"([^"]+)"/gi, 'collection="content/$1"');
            return updatedAttributes;
        });

        return updatedBody;
    },

    frontmatterLoops(directoryPath, sortByKey = 'date', filePath = null) {
        const files = fs.readdirSync(directoryPath);

        const frontmatters = [];

        //const converter = new showdown.Converter();
        let hasSortByKey = false;

        files.forEach((file) => {
            const filePath = `${directoryPath}/${file}`;
            const fileContent = fs.readFileSync(filePath, 'utf-8');

            // Extract the frontmatter from the markdown file
            const frontmatter = fm(fileContent).attributes; //fm.(fileContent, converter);

            if (frontmatter.hasOwnProperty(sortByKey)) {
                hasSortByKey = true;
            }

            frontmatter.content = this.removeFrontMatter(fileContent);
            frontmatter.link = filePath.replace(/.*\/content(.*)\..*/, '$1');
            frontmatters.push(frontmatter);
        });

        // Sort the frontmatters array by the specified key
        if (hasSortByKey) {
            frontmatters.sort((a, b) => a[sortByKey].localeCompare(b[sortByKey]));
        }

        return frontmatters;
    },

    forEachAttributesAndValues(string) {
        const regex = /<ForEach[\s\S]+?>/i;
        const attributes = {};

        const match = regex.exec(string);
        if (match) {
            const attributeString = match[0];
            const attributeRegex = /(\w+)\s*=\s*"([^"]+)"/g;
            let attributeMatch;

            while ((attributeMatch = attributeRegex.exec(attributeString)) !== null) {
                const attributeName = attributeMatch[1];
                const attributeValue = attributeMatch[2];
                attributes[attributeName] = attributeValue;
            }
        }

        return attributes
    },

    forEachContentTags(body) {
        const regex = /<ForEach[\s\S]+?>/gi;
        const forEachTags = [];

        let match;
        while ((match = regex.exec(body)) !== null) {
            const forEachTag = match[0];
            const attributeRegex = /(\w+)\s*=\s*"([^"]+)"/g;
            let attributeMatch;
            let hasContentAttribute = false;

            while ((attributeMatch = attributeRegex.exec(forEachTag)) !== null) {
                const attributeName = attributeMatch[1];
                const attributeValue = attributeMatch[2];
                if (attributeName === 'content') {
                    hasContentAttribute = true;
                    break;
                }
            }

            if (hasContentAttribute) {
                forEachTags.push(forEachTag);
            }
        }

        return forEachTags;
    },

    storeContentCollection(collectionName, collectionData) {
        const contentCollectionFolderPath = path.join(currentDirectory, '/collections/content');
        if (!fs.existsSync(contentCollectionFolderPath)) {
            fs.mkdirSync(contentCollectionFolderPath);
        }

        const filePath = path.join(contentCollectionFolderPath, `${collectionName}.json`);
        const jsonData = JSON.stringify(collectionData, null, 2);
        fs.writeFileSync(filePath, jsonData);
    },

    processCollectionLoops(template, filePath, frontmatterData = null) {
        // Regular expression to capture the ForEach sections
        const loopRegex = /<ForEach[\s\S]+?>([\s\S]*?)<\/ForEach>/gi;

        let match;
        while ((match = loopRegex.exec(template)) !== null) {
            const loopBody = match[1];

            const attributes = this.forEachAttributesAndValues(match[0]);

            // Extract the collection name from the attributes
            //const collectionNameMatch = /collection="([^"]+)"/.exec(attributeString);
            if (!attributes.collection) {
                continue; // Skip if collection name is not found
            }


            // Load the corresponding JSON file or frontmatter data
            let jsonData;
            if (attributes.collection.startsWith('frontmatter.')) {
                // Extract frontmatter data
                if (!frontmatterData || typeof frontmatterData !== 'object') {
                    // Skip silently if no frontmatter data - this is normal for pages without content
                    continue;
                }
                const frontmatterKey = attributes.collection.replace('frontmatter.', '');
                jsonData = frontmatterData[frontmatterKey];
                if (!jsonData) {
                    console.warn(`Frontmatter key '${frontmatterKey}' not found in frontmatter data. Available keys: ${Object.keys(frontmatterData).join(', ')}`);
                    continue;
                }
                if (!Array.isArray(jsonData)) {
                    console.warn(`Frontmatter key '${frontmatterKey}' is not an array, it's a ${typeof jsonData}`);
                    continue;
                }
            } else {
                // Load from JSON file
                jsonData = JSON.parse(fs.readFileSync(path.join(currentDirectory, '/collections/', `${attributes.collection}.json`), 'utf8'));
            }

            // Handle root attribute to navigate to a specific path in the JSON
            if (attributes.root) {
                const rootPath = attributes.root.split('.');
                for (const key of rootPath) {
                    if (jsonData && jsonData.hasOwnProperty(key)) {
                        jsonData = jsonData[key];
                    } else {
                        console.warn(`Root path '${attributes.root}' not found in collection '${attributes.collection}'`);
                        jsonData = [];
                        break;
                    }
                }

                // Validate that jsonData is an array after applying root
                if (!Array.isArray(jsonData)) {
                    console.warn(`Data at root '${attributes.root}' in collection '${attributes.collection}' is not an array`);
                    continue;
                }
            }

            // Ensure jsonData is an array for iteration
            if (!Array.isArray(jsonData)) {
                console.warn(`Collection '${attributes.collection}' is not an array. Use 'root' attribute to specify the array path.`);
                continue;
            }

            let loopKeyword = attributes.collection.replace(/\//g, '.');
            if (attributes.as) {
                loopKeyword = attributes.as;
            }

            let count = null;
            if (attributes.count) {
                count = attributes.count;
            }

            let offset = 0;
            if (attributes.offset) {
                offset = parseInt(attributes.offset, 10);
            }

            jsonData = this.handleOrderBy(jsonData, attributes);

            // Apply offset by slicing the array
            if (offset > 0) {
                jsonData = jsonData.slice(offset);
            }

            let loopResult = '';
            let loop = 1;
            for (const item of jsonData) {
                let processedBody = loopBody;
                const data = { ...item, loop };

                // Process conditions
                processedBody = this.processConditions(processedBody, data, loopKeyword, loop);

                for (const key in item) {
                    // Regular expression to replace the placeholders (including fallback syntax)
                    const placeholderRegex = new RegExp(`{${loopKeyword}.${key}(?:\\s+or\\s+.+?)?}`, 'g');
                    let itemValue = item[key];
                    if (Array.isArray(item[key])) {
                        // Check if array contains objects
                        if (item[key].length > 0 && typeof item[key][0] === 'object' && item[key][0] !== null) {
                            itemValue = JSON.stringify(item[key]);
                        } else {
                            itemValue = item[key].join("|");
                        }
                    } else if (typeof item[key] === 'object' && item[key] !== null) {
                        itemValue = JSON.stringify(item[key]);
                    }
                    processedBody = processedBody.replace(placeholderRegex, itemValue);
                }

                // Handle any remaining placeholders for this loop keyword with fallback syntax
                const fallbackRegex = new RegExp(`{${loopKeyword}\\.([^}|\\s]+)(?:\\s+or\\s+([^}]+))?}`, 'g');
                processedBody = processedBody.replace(fallbackRegex, (match, key, fallback) => {
                    if (fallback !== undefined) {
                        // Handle 'null' keyword (without quotes)
                        if (fallback.trim() === 'null') {
                            return '';
                        }
                        // Handle quoted strings
                        const quotedMatch = fallback.trim().match(/^['"](.*)['"]$/);
                        if (quotedMatch) {
                            return quotedMatch[1];
                        }
                        // Return unquoted value as-is
                        return fallback.trim();
                    }
                    return match;
                });

                loopResult += processedBody;
                loop++;

                if ((loop - 1) == count) {
                    break;
                }
            }

            template = template.replace(match[0], loopResult);
        }

        return template;
    },

    processConditions(content, data, parentCollection) {
        // Regular expression to capture the If sections
        const conditionRegex = /<If[\s\S]+?condition\s*=\s*"([^"]+)"[\s\S]*?>([\s\S]*?)<\/If>/gi;

        return content.replace(conditionRegex, (match, condition, body) => {
            // Convert placeholder {collectionName.key} into JavaScript context variables
            condition = condition.replace(/{([^}]+)\.([^}]+)}/g, (m, collection, key) => {
                if (collection === parentCollection && typeof data[key] === 'string') {
                    return JSON.stringify(data[key]); // Ensure strings are properly escaped
                } else if (collection === parentCollection) {
                    return data[key];
                }
                return m; // If the collection doesn't match, don't replace.
            });

            let meetsCondition = false;

            // Prepare the evaluation context
            let evalContextNames = [parentCollection, ...Object.keys(data)];
            let evalContextValues = [{ ...data }, ...Object.values(data)];

            // Dynamically create a function with the condition and evaluate it
            try {
                const evalFunction = new Function(...evalContextNames, `return ${condition};`);
                meetsCondition = evalFunction(...evalContextValues);
            } catch (err) {
                console.warn(`Failed to evaluate condition: ${condition}`, err);
            }

            return meetsCondition ? body : '';
        });
    },

    handleOrderBy: function (jsonData, attributes) {
        if (attributes.orderBy) {
            jsonData.sort((a, b) => {
                const orderBy = attributes.orderBy.split(',').map(item => item.trim());
                const valueA = a[orderBy[0]];
                const valueB = b[orderBy[0]];
                let direction = 'asc';

                if (orderBy.length > 1) {
                    direction = orderBy[1].toLowerCase().trim();
                }

                if (typeof valueA === 'string' && typeof valueB === 'string') {
                    if (direction === 'desc') {
                        return valueB.localeCompare(valueA);
                    } else {
                        return valueA.localeCompare(valueB);
                    }
                } else if (typeof valueA === 'number' && typeof valueB === 'number') {
                    if (direction === 'desc') {
                        return valueB - valueA;
                    } else {
                        return valueA - valueB;
                    }
                } else {
                    return 0;
                }
            });
        }

        return jsonData;
    }
}
