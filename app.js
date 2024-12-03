// Get container dimensions dynamically
const container = document.getElementById("chart");
const width = container.offsetWidth || 900;
const height = container.offsetHeight || 900;
const padding = 50; // Padding to prevent text cutoff
const outerRadius = Math.min(width, height) * 0.4; // Adjust for labels and layout
const innerRadius = outerRadius - 30;

// Create SVG container with padding
const svg = d3.select("#chart")
  .append("svg")
  .attr("width", width + padding * 2)
  .attr("height", height + padding * 2)
  .append("g")
  .attr("transform", `translate(${(width + padding * 2) / 2}, ${(height + padding * 2) / 2})`);

// Define color scale
const color = d3.scaleOrdinal(d3.schemeCategory10);

// Create tooltip
const tooltip = d3.select("body").append("div")
  .attr("class", "tooltip")
  .style("position", "absolute")
  .style("visibility", "hidden")
  .style("background", "rgba(0, 0, 0, 0.8)")
  .style("color", "#fff")
  .style("padding", "8px")
  .style("border-radius", "4px")
  .style("font-size", "14px");

// Load and preprocess the dataset
d3.csv("abundance.csv").then(data => {
  console.log("Loaded Data:", data);

  // Extract the first 10 unique dataset names
  const uniqueDatasets = Array.from(new Set(data.map(d => d.dataset_name))).slice(0, 10);
  console.log("Selected Datasets:", uniqueDatasets);

  // Filter data for these datasets
  const filteredData = data.filter(d => uniqueDatasets.includes(d.dataset_name));
  console.log("Filtered Data:", filteredData);

  // Generate labels strictly from dataset_name, sampleID, and country columns
  const labels = uniqueDatasets.map(dataset => {
    const sample = filteredData.find(d => d.dataset_name === dataset);
    if (sample) {
      return `${sample.dataset_name || "Unknown Dataset"} | ${sample.sampleID || "Unknown Sample"} | ${sample.country || "Unknown Country"}`;
    }
    return `${dataset} | Unknown Sample | Unknown Country`; // Fallback for missing values
  });
  console.log("Labels:", labels);

  // Aggregate taxonomic abundance by dataset_name
  const taxonomicColumns = Object.keys(filteredData[0]).filter(col => col.startsWith("k__"));
  const aggregatedData = uniqueDatasets.map(dataset => {
    const datasetRows = filteredData.filter(d => d.dataset_name === dataset);
    const aggregated = { dataset_name: dataset };
    taxonomicColumns.forEach(col => {
      aggregated[col] = d3.sum(datasetRows, row => parseFloat(row[col]) || 0);
    });
    return aggregated;
  });
  console.log("Aggregated Data:", aggregatedData);

  // Build a relationship matrix
  const matrix = buildMatrix(aggregatedData, taxonomicColumns);
  console.log("Matrix:", matrix);

  // Visualize the data
  updateVisualization(matrix, labels, filteredData);

}).catch(error => console.error("Error loading the dataset:", error));

// Function to build a relationship matrix
function buildMatrix(data, taxonomicColumns) {
  const size = data.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));

  data.forEach((source, i) => {
    data.forEach((target, j) => {
      taxonomicColumns.forEach(col => {
        const sourceValue = parseFloat(source[col]) || 0;
        const targetValue = parseFloat(target[col]) || 0;
        if (sourceValue > 0 && targetValue > 0) {
          matrix[i][j] += Math.min(sourceValue, targetValue); // Relationship logic
        }
      });
    });
  });

  console.log("Final Matrix:", matrix);
  return matrix;
}

// Function to update the visualization
function updateVisualization(matrix, labels, filteredData) {
  // Create the chord layout
  const chord = d3.chord()
    .padAngle(0.05)
    .sortSubgroups(d3.descending)(matrix);

  // Clear previous visualization
  svg.selectAll("*").remove();

  // Draw groups (arcs)
  const group = svg.append("g")
    .selectAll("g")
    .data(chord.groups)
    .join("g");

  group.append("path")
    .attr("d", d3.arc().innerRadius(innerRadius).outerRadius(outerRadius))
    .style("fill", d => color(d.index))
    .style("stroke", d => d3.rgb(color(d.index)).darker())
    .on("mouseover", (event, d) => {
      // Highlight connections
      svg.selectAll(".chord").style("opacity", 0.1);
      svg.selectAll(".chord")
        .filter(path => path.source.index === d.index || path.target.index === d.index)
        .style("opacity", 1);

      // Show tooltip
      const metadata = filteredData[d.index];
      tooltip.html(`
        <strong>Bodysite:</strong> ${metadata.bodysite}<br>
        <strong>Disease:</strong> ${metadata.disease}<br>
        <strong>Age:</strong> ${metadata.age}<br>
        <strong>Gender:</strong> ${metadata.gender}
      `)
        .style("visibility", "visible")
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY + 10}px`);
    })
    .on("mousemove", event => {
      tooltip.style("left", `${event.pageX + 10}px`).style("top", `${event.pageY + 10}px`);
    })
    .on("mouseout", () => {
      svg.selectAll(".chord").style("opacity", 1);
      tooltip.style("visibility", "hidden");
    });

  // Add labels to follow the arc radially
  group.append("text")
    .each(d => {
      d.angle = (d.startAngle + d.endAngle) / 2; // Calculate angle
    })
    .attr("transform", d => `
      rotate(${(d.angle * 180) / Math.PI - 90})
      translate(${outerRadius + 10})
      rotate(${d.angle > Math.PI ? 180 : 0})
    `)
    .style("text-anchor", d => (d.angle > Math.PI ? "end" : "start")) // Align based on angle
    .style("alignment-baseline", "middle")
    .style("font-size", "12px")
    .each(function (d, i) {
      // Wrap long labels onto multiple lines
      const words = labels[d.index].split(" | "); // Split on delimiter
      const textElement = d3.select(this);
      const lineHeight = 1.1; // Line spacing
      words.forEach((word, idx) => {
        textElement.append("tspan")
          .text(word)
          .attr("x", 0) // Keep centered radially
          .attr("dy", `${idx === 0 ? 0 : lineHeight}em`); // Offset for multiple lines
      });
    });

  // Draw chords (relationships)
  svg.append("g")
    .attr("fill-opacity", 0.7)
    .selectAll("path")
    .data(chord)
    .join("path")
    .attr("class", "chord")
    .attr("d", d3.ribbon().radius(innerRadius))
    .style("fill", d => color(d.target.index))
    .style("stroke", d => d3.rgb(color(d.target.index)).darker());
}
